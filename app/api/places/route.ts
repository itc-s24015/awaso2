import { createSupabaseServerClient } from "@/lib/supabase/server";

type PlaceSummary = {
  id: string;
  name: string;
  address: string | null;
};

type PlaceLocation = {
  latitude: number;
  longitude: number;
};

type PlaceSearchResult = PlaceSummary & {
  location: PlaceLocation;
  distanceMeters: number;
};

type SearchLocationInput =
  | { mode: "area"; area: string }
  | { mode: "current"; latitude: number; longitude: number };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedRadiusKm = [5, 10, 20, 50];
const placesSearchEndpoint = "https://places.googleapis.com/v1/places:searchText";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlaceLocation(value: unknown): value is PlaceLocation {
  return (
    isRecord(value) &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

function toSearchLocationInput(value: unknown): SearchLocationInput | null {
  if (!isRecord(value)) return null;

  if (value.mode === "area" && typeof value.area === "string") {
    const area = value.area.trim();
    return area.length > 0 && area.length <= 120 ? { mode: "area", area } : null;
  }

  if (
    value.mode === "current" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  ) {
    return {
      mode: "current",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  return null;
}

function toPlaceSummary(value: unknown): PlaceSummary | null {
  if (!isRecord(value)) return null;

  const displayName = value.displayName;
  if (
    typeof value.id !== "string" ||
    !isRecord(displayName) ||
    typeof displayName.text !== "string" ||
    (value.formattedAddress !== undefined &&
      value.formattedAddress !== null &&
      typeof value.formattedAddress !== "string")
  ) {
    return null;
  }

  return {
    id: value.id,
    name: displayName.text,
    address: typeof value.formattedAddress === "string" ? value.formattedAddress : null,
  };
}

function distanceMeters(from: PlaceLocation, to: PlaceLocation) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDifference = toRadians(to.latitude - from.latitude);
  const longitudeDifference = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine = Math.min(1, Math.max(0,
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDifference / 2) ** 2,
  ));

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

class GoogleMapsRequestError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

async function resolveSearchCenter(
  apiKey: string,
  location: SearchLocationInput,
): Promise<PlaceLocation> {
  if (location.mode === "current") {
    return { latitude: location.latitude, longitude: location.longitude };
  }

  const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  endpoint.searchParams.set("address", location.area);
  endpoint.searchParams.set("components", "country:JP");
  endpoint.searchParams.set("language", "ja");
  endpoint.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(endpoint, { cache: "no-store" });
  } catch {
    throw new GoogleMapsRequestError("Google Geocodingに接続できませんでした。");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GoogleMapsRequestError("Google Geocodingから応答を読み取れませんでした。");
  }

  if (!response.ok || !isRecord(payload)) {
    throw new GoogleMapsRequestError("Google Geocodingのリクエストに失敗しました。");
  }

  if (payload.status === "ZERO_RESULTS") {
    throw new GoogleMapsRequestError("入力した地域が見つかりませんでした。日本国内の地域名を入力してください。", 422);
  }
  if (payload.status === "OVER_QUERY_LIMIT" || payload.status === "OVER_DAILY_LIMIT") {
    throw new GoogleMapsRequestError("Geocoding APIの利用上限に達しました。時間をおいて再度お試しください。", 429);
  }
  if (payload.status !== "OK") {
    throw new GoogleMapsRequestError("Google Geocodingを利用できませんでした。API設定と利用上限を確認してください。");
  }

  if (!Array.isArray(payload.results) || payload.results.length === 0) {
    throw new GoogleMapsRequestError("Google Geocodingから地域情報を取得できませんでした。");
  }

  const firstResult = payload.results[0];
  if (!isRecord(firstResult) || !isRecord(firstResult.geometry) || !isRecord(firstResult.geometry.location)) {
    throw new GoogleMapsRequestError("Google Geocodingの応答形式が正しくありません。");
  }

  const { lat, lng } = firstResult.geometry.location;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    throw new GoogleMapsRequestError("Google Geocodingから有効な座標を取得できませんでした。");
  }

  return { latitude: lat, longitude: lng };
}

async function searchPlacesByType(
  apiKey: string,
  query: string,
  center: PlaceLocation,
  radiusKm: number,
  includedType: string,
): Promise<PlaceSearchResult[]> {
  let response: Response;
  try {
    response = await fetch(placesSearchEndpoint, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "ja",
        regionCode: "JP",
        includedType,
        strictTypeFiltering: true,
        locationBias: {
          circle: {
            center,
            radius: radiusKm * 1000,
          },
        },
        pageSize: 20,
        rankPreference: "DISTANCE",
      }),
      cache: "no-store",
    });
  } catch {
    throw new GoogleMapsRequestError("Google Placesに接続できませんでした。時間をおいて再度お試しください。");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GoogleMapsRequestError("Google Placesから応答を読み取れませんでした。");
  }

  if (!response.ok) {
    throw new GoogleMapsRequestError(
      `Google Placesのリクエストに失敗しました: ${googleErrorMessage(payload)}`,
    );
  }
  if (!isRecord(payload)) {
    throw new GoogleMapsRequestError("Google Placesの検索結果を読み取れませんでした。");
  }
  if (!("places" in payload)) return [];
  if (!Array.isArray(payload.places)) {
    throw new GoogleMapsRequestError("Google Placesの検索結果形式が正しくありません。");
  }

  const places: PlaceSearchResult[] = [];
  for (const result of payload.places) {
    const place = toPlaceSummary(result);
    if (!place) {
      throw new GoogleMapsRequestError("Google Placesの検索結果に必要な項目がありません。");
    }
    if (!isRecord(result) || !isPlaceLocation(result.location)) continue;

    places.push({
      ...place,
      location: result.location,
      distanceMeters: distanceMeters(center, result.location),
    });
  }
  return places;
}

function googleErrorMessage(value: unknown) {
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }
  return "Google Placesから有効な応答を受け取れませんでした。";
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "リクエスト形式が正しくありません。" }, 400);
  }

  if (!isRecord(input)) {
    return jsonResponse({ error: "検索条件が正しくありません。" }, 400);
  }

  const action = input.action;
  const groupId = input.groupId;
  const searchQuery = typeof input.query === "string" ? input.query.trim() : "";
  const favoritePlaceId =
    typeof input.favoritePlaceId === "string" ? input.favoritePlaceId : "";
  const category = input.category;
  const radiusKm = input.radiusKm;
  const searchLocation = toSearchLocationInput(input.location);
  let searchRequest: {
    category: "shops_and_food" | "parking";
    radiusKm: number;
    location: SearchLocationInput;
  } | null = null;
  if (
    typeof action !== "string" ||
    typeof groupId !== "string" ||
    !uuidPattern.test(groupId)
  ) {
    return jsonResponse({ error: "検索条件が正しくありません。" }, 400);
  }

  if (action === "search") {
    if (searchQuery.length === 0 || searchQuery.length > 120) {
      return jsonResponse({ error: "検索語は1〜120文字で入力してください。" }, 400);
    }
    if (category !== "shops_and_food" && category !== "parking") {
      return jsonResponse({ error: "検索対象を選択してください。" }, 400);
    }
    if (typeof radiusKm !== "number" || !allowedRadiusKm.includes(radiusKm)) {
      return jsonResponse({ error: "検索半径を選択してください。" }, 400);
    }
    if (!searchLocation) {
      return jsonResponse({ error: "地域または有効な現在地を指定してください。" }, 400);
    }
    searchRequest = { category, radiusKm, location: searchLocation };
  } else if (action === "details") {
    if (!uuidPattern.test(favoritePlaceId)) {
      return jsonResponse({ error: "お気に入りの場所を指定してください。" }, 400);
    }
  } else {
    return jsonResponse({ error: "利用できない場所操作です。" }, 400);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return jsonResponse({ error: `ログイン状態を確認できませんでした: ${authError.message}` }, 500);
  }
  if (!user) {
    return jsonResponse({ error: "ログインしてから場所を検索してください。" }, 401);
  }

  const membershipResult = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipResult.error) {
    return jsonResponse({ error: `グループを確認できませんでした: ${membershipResult.error.message}` }, 500);
  }
  if (!membershipResult.data) {
    return jsonResponse({ error: "このグループのメンバーだけが場所検索を利用できます。" }, 403);
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "Google Maps APIキーが未設定です。管理者に設定を依頼してください。" }, 503);
  }

  if (action === "search") {
    if (!searchRequest) {
      return jsonResponse({ error: "検索条件が正しくありません。" }, 400);
    }
    const { category: selectedCategory, radiusKm: selectedRadiusKm, location } = searchRequest;
    try {
      const center = await resolveSearchCenter(apiKey, location);
      const includedTypes = selectedCategory === "parking"
        ? ["parking"]
        : ["store", "restaurant", "cafe"];
      const resultsByType = await Promise.all(
        includedTypes.map((includedType) =>
          searchPlacesByType(apiKey, searchQuery, center, selectedRadiusKm, includedType),
        ),
      );
      const uniquePlaces = new Map<string, PlaceSearchResult>();
      for (const place of resultsByType.flat()) {
        if (place.distanceMeters <= selectedRadiusKm * 1000 && !uniquePlaces.has(place.id)) {
          uniquePlaces.set(place.id, place);
        }
      }

      const places = [...uniquePlaces.values()]
        .sort((left, right) => left.distanceMeters - right.distanceMeters)
        .slice(0, 10);
      return jsonResponse({ places });
    } catch (error) {
      if (error instanceof GoogleMapsRequestError) {
        return jsonResponse({ error: error.message }, error.status);
      }
      throw error;
    }
  }

  const favoriteResult = await supabase
    .from("group_favorites")
    .select("place_id")
    .eq("group_id", groupId)
    .eq("place_id", favoritePlaceId)
    .maybeSingle();
  if (favoriteResult.error) {
    return jsonResponse({ error: `お気に入りを確認できませんでした: ${favoriteResult.error.message}` }, 500);
  }
  if (!favoriteResult.data) {
    return jsonResponse({ error: "このグループのお気に入りだけ詳細を表示できます。" }, 404);
  }

  const placeResult = await supabase
    .from("places")
    .select("provider_place_id")
    .eq("id", favoritePlaceId)
    .eq("provider", "google_maps")
    .maybeSingle();
  if (placeResult.error) {
    return jsonResponse({ error: `場所情報を確認できませんでした: ${placeResult.error.message}` }, 500);
  }
  if (!placeResult.data) {
    return jsonResponse({ error: "保存された場所情報が見つかりません。" }, 404);
  }

  const endpoint = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeResult.data.provider_place_id)}`;
  let googleResponse: Response;
  try {
    googleResponse = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,formattedAddress",
      },
      cache: "no-store",
    });
  } catch {
    return jsonResponse({ error: "Google Placesに接続できませんでした。時間をおいて再度お試しください。" }, 502);
  }

  let googlePayload: unknown;
  try {
    googlePayload = await googleResponse.json();
  } catch {
    return jsonResponse({ error: "Google Placesから応答を読み取れませんでした。" }, 502);
  }

  if (!googleResponse.ok) {
    return jsonResponse({ error: `Google Placesのリクエストに失敗しました: ${googleErrorMessage(googlePayload)}` }, 502);
  }

  const place = toPlaceSummary(googlePayload);
  return place
    ? jsonResponse({ place })
    : jsonResponse({ error: "場所の詳細情報を取得できませんでした。" }, 502);
}
