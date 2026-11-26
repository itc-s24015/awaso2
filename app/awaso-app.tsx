"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import {
  ACTIVITY_INTERESTS,
  filterActivityTemplates,
  type ActivityInterest,
  type ActivityParticipantCount,
} from "@/lib/activity-templates";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type ScreenId =
  | "home"
  | "groups"
  | "invite"
  | "join"
  | "plans"
  | "create"
  | "activities"
  | "dates"
  | "places"
  | "favorites"
  | "ai"
  | "gacha"
  | "preferences"
  | "memories"
  | "notifications"
  | "settings";

type IconName =
  | "home"
  | "groups"
  | "plans"
  | "calendar"
  | "map"
  | "heart"
  | "sparkles"
  | "shuffle"
  | "chart"
  | "image"
  | "bell"
  | "settings"
  | "plus"
  | "search"
  | "pin"
  | "arrow"
  | "clock"
  | "check"
  | "sun"
  | "filter"
  | "star"
  | "camera"
  | "user"
  | "close"
  | "menu"
  | "copy"
  | "external"
  | "edit"
  | "send"
  | "chevron";

type AiBudgetSelection = "3000" | "5000" | "10000" | "any";

const AI_INTEREST_PRESENTATION: Record<
  ActivityInterest,
  { emoji: string; artClass: string }
> = {
  自然: { emoji: "🌿", artClass: "art-ocean" },
  食事: { emoji: "🍰", artClass: "art-cafe" },
  体験: { emoji: "🎨", artClass: "art-purple" },
  のんびり: { emoji: "☕", artClass: "art-sunset" },
  アクティブ: { emoji: "🎳", artClass: "art-blue" },
};

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

type PlaceSearchLocationInput =
  | { mode: "area"; area: string }
  | { mode: "current"; latitude: number; longitude: number };

type PlaceMapSelection = {
  id: string;
  name: string;
  address: string | null;
  groupId?: string;
};

type GroupFavoritePlace = {
  groupId: string;
  placeId: string;
  addedBy: string | null;
  createdAt: string;
  providerPlaceId: string;
};

type GroupMember = {
  userId: string;
  nickname: string;
  role: "admin" | "member";
};

type GroupRecord = {
  id: string;
  name: string;
  role: "admin" | "member";
  members: GroupMember[];
};

type PlanRecord = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  description: string | null;
  status: "planning" | "confirmed";
  response_deadline: string | null;
  created_at: string;
};

type DateCandidateRecord = Database["public"]["Tables"]["plan_date_candidates"]["Row"];
type DateResponseRecord = Database["public"]["Tables"]["plan_date_responses"]["Row"];
type DateResponse = DateResponseRecord["response"];

type JoinRequestRecord = {
  id: string;
  groupId: string;
  userId: string;
  groupName: string;
  requesterNickname: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
};

type NotificationRecord = {
  id: string;
  groupJoinRequestId: string | null;
  eventType: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type InvitationPreview = {
  groupId: string;
  groupName: string;
  expiresAt: string;
  alreadyMember: boolean;
  expired: boolean;
};

type IssuedInvitation = InvitationPreview & { token: string };

type WorkspaceData = {
  groups: GroupRecord[];
  plans: PlanRecord[];
  joinRequests: JoinRequestRecord[];
  notifications: NotificationRecord[];
};

type WorkspaceResult =
  | { data: WorkspaceData; error: null }
  | { data: null; error: string };

type AwasoSupabaseClient = SupabaseClient<Database>;

function isPlaceSummary(value: unknown): value is PlaceSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "address" in value &&
    (typeof value.address === "string" || value.address === null)
  );
}

function isPlaceSearchResult(value: unknown): value is PlaceSearchResult {
  if (!isPlaceSummary(value) || !("distanceMeters" in value) || !("location" in value)) {
    return false;
  }

  const location = value.location;
  return (
    typeof value.distanceMeters === "number" &&
    Number.isFinite(value.distanceMeters) &&
    typeof location === "object" &&
    location !== null &&
    "latitude" in location &&
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    "longitude" in location &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}

function getCurrentPlaceLocation(): Promise<PlaceLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("このブラウザーでは現在地を取得できません。地域を入力して検索してください。"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "位置情報の利用が許可されませんでした。地域を入力するか、ブラウザーの設定を確認してください。"
          : error.code === error.TIMEOUT
            ? "現在地を取得できませんでした。時間をおいて再度お試しください。"
            : "現在地を取得できませんでした。地域を入力して検索してください。";
        reject(new Error(message));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  });
}

function subscribeToSearch(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getClientSearch() {
  return window.location.search;
}

async function fetchWorkspaceData(
  supabase: AwasoSupabaseClient,
  userId: string,
): Promise<WorkspaceResult> {
  const membershipsResult = await supabase
    .from("group_members")
    .select("group_id, user_id, role")
    .eq("user_id", userId);

  if (membershipsResult.error) {
    return { data: null, error: membershipsResult.error.message };
  }

  const groupIds = [...new Set(membershipsResult.data.map((row) => row.group_id))];
  const adminGroupIds = membershipsResult.data
    .filter((membership) => membership.role === "admin")
    .map((membership) => membership.group_id);

  let groupRows: { id: string; name: string }[] = [];
  let memberRows: { group_id: string; user_id: string; role: "admin" | "member" }[] = [];
  let planRows: PlanRecord[] = [];

  if (groupIds.length > 0) {
    const [groupsResult, membersResult, plansResult] = await Promise.all([
      supabase.from("groups").select("id, name").in("id", groupIds).order("created_at"),
      supabase
        .from("group_members")
        .select("group_id, user_id, role")
        .in("group_id", groupIds),
      supabase
        .from("plans")
        .select("id, group_id, created_by, title, description, status, response_deadline, created_at")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false }),
    ]);

    if (groupsResult.error) return { data: null, error: groupsResult.error.message };
    if (membersResult.error) return { data: null, error: membersResult.error.message };
    if (plansResult.error) return { data: null, error: plansResult.error.message };
    groupRows = groupsResult.data;
    memberRows = membersResult.data;
    planRows = plansResult.data;
  }

  const [ownRequestsResult, adminRequestsResult, notificationsResult] = await Promise.all([
    supabase
      .from("group_join_requests")
      .select("id, group_id, user_id, status, requested_at")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false }),
    adminGroupIds.length > 0
      ? supabase
          .from("group_join_requests")
          .select("id, group_id, user_id, status, requested_at")
          .in("group_id", adminGroupIds)
          .eq("status", "pending")
          .order("requested_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("notification_deliveries")
      .select("id, group_join_request_id, event_type, title, body, created_at, read_at")
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (ownRequestsResult.error) return { data: null, error: ownRequestsResult.error.message };
  if (adminRequestsResult.error) return { data: null, error: adminRequestsResult.error.message };
  if (notificationsResult.error) return { data: null, error: notificationsResult.error.message };

  const requestRows = [
    ...new Map(
      [...ownRequestsResult.data, ...adminRequestsResult.data].map((request) => [
        request.id,
        request,
      ]),
    ).values(),
  ];
  const userIds = [
    ...new Set([
      ...memberRows.map((row) => row.user_id),
      ...requestRows.map((row) => row.user_id),
    ]),
  ];
  const profilesResult =
    userIds.length > 0
      ? await supabase.from("user_profiles").select("id, nickname").in("id", userIds)
      : { data: [], error: null };

  if (profilesResult.error) {
    return { data: null, error: profilesResult.error.message };
  }

  const nicknames = new Map(
    profilesResult.data.map((profile) => [profile.id, profile.nickname]),
  );
  const membersByGroup = new Map<string, GroupMember[]>();

  for (const row of memberRows) {
    const groupMembers = membersByGroup.get(row.group_id) ?? [];
    groupMembers.push({
      userId: row.user_id,
      nickname: nicknames.get(row.user_id) ?? "あわそユーザー",
      role: row.role,
    });
    membersByGroup.set(row.group_id, groupMembers);
  }

  const rolesByGroup = new Map(
    membershipsResult.data.map((membership) => [membership.group_id, membership.role]),
  );
  const groupNames = new Map(groupRows.map((group) => [group.id, group.name]));

  return {
    data: {
      groups: groupRows.map((group) => ({
        ...group,
        role: rolesByGroup.get(group.id) ?? "member",
        members: membersByGroup.get(group.id) ?? [],
      })),
      plans: planRows,
      joinRequests: requestRows.map((request) => ({
        id: request.id,
        groupId: request.group_id,
        userId: request.user_id,
        groupName: groupNames.get(request.group_id) ?? "グループ",
        requesterNickname: nicknames.get(request.user_id) ?? "あわそユーザー",
        status: request.status,
        requestedAt: request.requested_at,
      })),
      notifications: notificationsResult.data.map((notification) => ({
        id: notification.id,
        groupJoinRequestId: notification.group_join_request_id,
        eventType: notification.event_type,
        title: notification.title,
        body: notification.body,
        createdAt: notification.created_at,
        readAt: notification.read_at,
      })),
    },
    error: null,
  };
}

type DateWorkspaceResult =
  | { data: { candidates: DateCandidateRecord[]; responses: DateResponseRecord[] }; error: null }
  | { data: null; error: string };

type LoadedDateWorkspace = {
  planId: string;
  version: number;
  data: { candidates: DateCandidateRecord[]; responses: DateResponseRecord[] } | null;
  error: string;
};

async function fetchDateWorkspaceData(
  supabase: AwasoSupabaseClient,
  planId: string,
): Promise<DateWorkspaceResult> {
  const candidatesResult = await supabase
    .from("plan_date_candidates")
    .select("*")
    .eq("plan_id", planId)
    .order("starts_at");

  if (candidatesResult.error) {
    return { data: null, error: candidatesResult.error.message };
  }

  if (candidatesResult.data.length === 0) {
    return { data: { candidates: [], responses: [] }, error: null };
  }

  const responsesResult = await supabase
    .from("plan_date_responses")
    .select("*")
    .in(
      "candidate_id",
      candidatesResult.data.map((candidate) => candidate.id),
    );

  if (responsesResult.error) {
    return { data: null, error: responsesResult.error.message };
  }

  return {
    data: {
      candidates: candidatesResult.data,
      responses: responsesResult.data,
    },
    error: null,
  };
}

const dateResponseOptions: {
  value: DateResponse;
  symbol: string;
  label: string;
  className: string;
}[] = [
  { value: "available", symbol: "○", label: "参加可能", className: "vote-0" },
  { value: "conditional", symbol: "△", label: "条件次第", className: "vote-1" },
  { value: "unavailable", symbol: "×", label: "参加不可", className: "vote-2" },
];

function getDateCandidateDisplay(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(date);

  return {
    date: new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(start),
    weekday: new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(start),
    time: `${formatTime(start)}–${formatTime(end)}`,
  };
}

function toLocalDateTimeParts(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function toLocalDateInputValue(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currentTimestamp() {
  return Date.now();
}

function rankDateCandidates(
  candidates: DateCandidateRecord[],
  responses: DateResponseRecord[],
) {
  const sorted = candidates
    .map((candidate) => {
      const candidateResponses = responses.filter(
        (response) => response.candidate_id === candidate.id,
      );
      return {
        ...candidate,
        responses: candidateResponses,
        availableCount: candidateResponses.filter((response) => response.response === "available").length,
        conditionalCount: candidateResponses.filter((response) => response.response === "conditional").length,
        unavailableCount: candidateResponses.filter((response) => response.response === "unavailable").length,
      };
    })
    .sort(
      (first, second) =>
        second.availableCount - first.availableCount ||
        first.starts_at.localeCompare(second.starts_at),
    );

  return sorted.map((candidate) => ({
    ...candidate,
    rank:
      sorted.findIndex((item) => item.availableCount === candidate.availableCount) + 1,
  }));
}

const iconGlyphs: Record<IconName, string> = {
  home: "⌂",
  groups: "◉",
  plans: "▤",
  calendar: "▦",
  map: "⌖",
  heart: "♡",
  sparkles: "✦",
  shuffle: "⤨",
  chart: "◫",
  image: "▧",
  bell: "♧",
  settings: "⚙",
  plus: "+",
  search: "⌕",
  pin: "⌖",
  arrow: "↗",
  clock: "◷",
  check: "✓",
  sun: "☼",
  filter: "☷",
  star: "☆",
  camera: "▣",
  user: "○",
  close: "×",
  menu: "☰",
  copy: "▢",
  external: "↗",
  edit: "✎",
  send: "➤",
  chevron: "›",
};

const primaryNavigation: { id: ScreenId; label: string; icon: IconName }[] = [
  { id: "home", label: "ホーム", icon: "home" },
  { id: "groups", label: "グループ", icon: "groups" },
  { id: "plans", label: "企画一覧", icon: "plans" },
  { id: "dates", label: "日程調整", icon: "calendar" },
  { id: "places", label: "行き先を探す", icon: "map" },
  { id: "favorites", label: "お気に入り", icon: "heart" },
];

const discoveryNavigation: { id: ScreenId; label: string; icon: IconName }[] = [
  { id: "ai", label: "AIプラン提案", icon: "sparkles" },
  { id: "gacha", label: "遊びガチャ", icon: "shuffle" },
  { id: "preferences", label: "グループの好み", icon: "chart" },
  { id: "memories", label: "思い出アルバム", icon: "image" },
  { id: "notifications", label: "お知らせ", icon: "bell" },
  { id: "settings", label: "設定", icon: "settings" },
];

const screenTitles: Record<ScreenId, string> = {
  home: "ホーム",
  groups: "グループ",
  invite: "グループへ招待",
  join: "グループに参加",
  plans: "企画一覧",
  create: "企画を作成",
  activities: "遊び内容を選ぶ",
  dates: "日程調整",
  places: "お店・駐車場検索",
  favorites: "お気に入り",
  ai: "AIプラン提案",
  gacha: "遊びガチャ",
  preferences: "グループの好み",
  memories: "思い出アルバム",
  notifications: "お知らせ",
  settings: "プロフィール・設定",
};

const activityOptions = [
  { name: "カフェ", emoji: "☕", caption: "ゆっくりおしゃべり", color: "lavender" },
  { name: "ボウリング", emoji: "🎳", caption: "みんなで盛り上がる", color: "blue" },
  { name: "BBQ", emoji: "🍖", caption: "外でわいわい", color: "orange" },
  { name: "映画", emoji: "🎬", caption: "気になる作品を観る", color: "pink" },
  { name: "ドライブ", emoji: "🚙", caption: "景色を楽しむ", color: "green" },
  { name: "水族館", emoji: "🐠", caption: "のんびり癒やされる", color: "cyan" },
];

const members = [
  { name: "さくら", initials: "さ", color: "avatar-lime", role: "リーダー" },
  { name: "まな", initials: "ま", color: "avatar-purple", role: "" },
  { name: "ゆうき", initials: "ゆ", color: "avatar-blue", role: "" },
  { name: "れん", initials: "れ", color: "avatar-orange", role: "" },
];

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <span className={`icon icon-${name} ${className}`} aria-hidden="true">
      {iconGlyphs[name]}
    </span>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark-compact" : ""}`}>
      <span className="brand-symbol">あ</span>
      <span className="brand-word">
        <strong>あわそ</strong>
        <small>AWASO</small>
      </span>
    </div>
  );
}

function Avatar({
  initials,
  color,
  size = "normal",
}: {
  initials: string;
  color: string;
  size?: "normal" | "small" | "large";
}) {
  return <span className={`avatar ${color} avatar-${size}`}>{initials}</span>;
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
}

function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function formatPlaceDistance(distanceMeters: number) {
  return distanceMeters < 1000
    ? `${Math.round(distanceMeters / 10) * 10} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}

function PlaceCard({
  name,
  address,
  distanceMeters,
  favorite,
  canToggleFavorite,
  onFavorite,
  mapAction,
  detailAction,
}: {
  name: string;
  address: string;
  distanceMeters?: number;
  favorite: boolean;
  canToggleFavorite: boolean;
  onFavorite: () => void;
  mapAction?: () => void;
  detailAction?: { label: string; loading: boolean; onClick: () => void };
}) {
  return (
    <article className="place-card">
      <div className="place-info">
        <div className="place-title-row">
          <h3>{name}</h3>
          <button
            className={`icon-button favorite-button ${favorite ? "is-favorite" : ""}`}
            onClick={onFavorite}
            aria-label={
              favorite
                ? canToggleFavorite
                  ? "お気に入りから削除"
                  : "グループのお気に入りに登録済み"
                : canToggleFavorite
                  ? "お気に入りに追加"
                  : "グループを選択してください"
            }
            disabled={!canToggleFavorite}
            type="button"
          >
            <Icon name="heart" />
          </button>
        </div>
        <p className="place-address">
          <Icon name="pin" /> {address}
        </p>
        {distanceMeters !== undefined && (
          <p className="place-distance">{formatPlaceDistance(distanceMeters)} · 直線距離</p>
        )}
        {mapAction && (
          <button className="text-action" type="button" onClick={mapAction}>
            地図で見る
          </button>
        )}
        {detailAction && (
          <button
            className="text-action"
            type="button"
            onClick={detailAction.onClick}
            disabled={detailAction.loading}
          >
            {detailAction.loading ? "取得中…" : detailAction.label}
          </button>
        )}
      </div>
    </article>
  );
}

function PlaceMapPanel({ place }: { place: PlaceMapSelection | null }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
  const embedUrl = new URL("https://www.google.com/maps/embed/v1/place");
  embedUrl.searchParams.set("q", `place_id:${place?.id ?? ""}`);
  embedUrl.searchParams.set("language", "ja");
  if (apiKey) embedUrl.searchParams.set("key", apiKey);

  const googleMapsUrl = new URL("https://www.google.com/maps/search/");
  googleMapsUrl.searchParams.set("api", "1");
  googleMapsUrl.searchParams.set("query", place?.name ?? "");
  if (place) googleMapsUrl.searchParams.set("query_place_id", place.id);

  return (
    <aside className="places-map-panel panel">
      <SectionHeading title="Google Maps" />
      {place ? (
        <>
          <div className="place-map-caption">
            <strong>{place.name}</strong>
            {place.address && <span>{place.address}</span>}
          </div>
          {apiKey ? (
            <iframe
              className="place-map-embed"
              title={`${place.name}のGoogle Maps地図`}
              src={embedUrl.toString()}
              loading="lazy"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="place-map-unavailable" role="status">
              <p>地図を表示するにはMaps Embed APIキーの設定が必要です。</p>
              <a href={googleMapsUrl.toString()} target="_blank" rel="noreferrer">
                Google Mapsで場所を開く
              </a>
            </div>
          )}
          {apiKey && (
            <a className="place-map-external-link" href={googleMapsUrl.toString()} target="_blank" rel="noreferrer">
              Google Mapsで開く
            </a>
          )}
        </>
      ) : (
        <div className="place-map-empty">
          候補の「地図で見る」を選ぶと、選択した場所の地図を表示します。
        </div>
      )}
    </aside>
  );
}

function AuthScreen({
  configured,
  loading,
  error,
  invitationToken,
  invitationPreview,
  invitationLoading,
  invitationError,
  onGoogleSignIn,
}: {
  configured: boolean;
  loading: boolean;
  error: string;
  invitationToken: string | null;
  invitationPreview: InvitationPreview | null;
  invitationLoading: boolean;
  invitationError: string;
  onGoogleSignIn: () => void;
}) {
  const search = useSyncExternalStore(subscribeToSearch, getClientSearch, () => "");
  const callbackError = new URLSearchParams(search).get("authError");
  const displayError =
    error ||
    (callbackError === "callback"
      ? "Googleログインを完了できませんでした。設定とリダイレクトURLを確認してください。"
      : "");

  return (
    <main className="auth-screen">
      <section className="auth-panel panel">
        <BrandMark />
        <span className="eyebrow">WELCOME TO AWASO</span>
        <h1>友だちとの予定を、<br />みんなで決めよう。</h1>
        <p>Googleアカウントでログインして、グループや企画を保存できます。</p>
        {displayError && <div className="auth-error" role="alert">{displayError}</div>}
        {invitationToken && (
          <div className="invite-preview-card">
            {invitationLoading ? (
              <span>招待先を確認しています…</span>
            ) : invitationError ? (
              <span role="alert">{invitationError}</span>
            ) : invitationPreview ? (
              <>
                <small>招待されています</small>
                <strong>{invitationPreview.groupName}</strong>
                <span>Googleログイン後、参加申請を送信できます。</span>
              </>
            ) : null}
          </div>
        )}
        {!configured && (
          <div className="auth-setup-note">
            <strong>Supabaseの設定が必要です</strong>
            <span>`.env.local`にProject URLとPublishable keyを設定してください。</span>
            <code>NEXT_PUBLIC_SUPABASE_URL</code>
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
        )}
        <button
          className="button button-lime button-full auth-submit"
          type="button"
          disabled={!configured || loading}
          onClick={onGoogleSignIn}
        >
          {loading ? "ログイン中…" : "Googleでログイン"}
        </button>
        <small>プロフィール名以外の年齢情報は取得しません。</small>
      </section>
    </main>
  );
}

export default function AwasoApp({
  invitationToken = null,
}: {
  invitationToken?: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [authError, setAuthError] = useState("");
  const [needsNickname, setNeedsNickname] = useState(false);
  const [invitationPreview, setInvitationPreview] = useState<InvitationPreview | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(Boolean(invitationToken && supabase));
  const [invitationError, setInvitationError] = useState("");
  const [issuedInvitation, setIssuedInvitation] = useState<IssuedInvitation | null>(null);
  const [screen, setScreen] = useState<ScreenId>(invitationToken ? "join" : "home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [hasSearchedPlaces, setHasSearchedPlaces] = useState(false);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");
  const [placeCategory, setPlaceCategory] = useState<"shops_and_food" | "parking">("shops_and_food");
  const [placeLocationMode, setPlaceLocationMode] = useState<"area" | "current">("area");
  const [placeArea, setPlaceArea] = useState("");
  const [placeRadiusKm, setPlaceRadiusKm] = useState(10);
  const [selectedSearchMapPlace, setSelectedSearchMapPlace] = useState<PlaceMapSelection | null>(null);
  const [selectedFavoriteMapPlace, setSelectedFavoriteMapPlace] = useState<PlaceMapSelection | null>(null);
  const [favoritePlaces, setFavoritePlaces] = useState<GroupFavoritePlace[]>([]);
  const [favoriteGroupId, setFavoriteGroupId] = useState("");
  const [favoriteError, setFavoriteError] = useState<{ groupId: string; message: string } | null>(null);
  const [favoriteRefreshVersion, setFavoriteRefreshVersion] = useState(0);
  const [placeDetails, setPlaceDetails] = useState<Record<string, PlaceSummary>>({});
  const [favoriteDetailLoadingIds, setFavoriteDetailLoadingIds] = useState<string[]>([]);
  const [dateWorkspace, setDateWorkspace] = useState<LoadedDateWorkspace | null>(null);
  const [dateRefreshVersion, setDateRefreshVersion] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [savingVoteCandidateId, setSavingVoteCandidateId] = useState("");
  const [joinCode, setJoinCode] = useState(invitationToken ?? "");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [planTitle, setPlanTitle] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [responseDeadline, setResponseDeadline] = useState("");
  const [selectedActivities, setSelectedActivities] = useState<string[]>(["カフェ"]);
  const [aiBudget, setAiBudget] = useState<AiBudgetSelection>("5000");
  const [aiArea, setAiArea] = useState("");
  const [aiParticipantCount, setAiParticipantCount] =
    useState<ActivityParticipantCount>(4);
  const [aiInterests, setAiInterests] = useState<ActivityInterest[]>([]);
  const [aiHasGenerated, setAiHasGenerated] = useState(false);
  const [aiCurrentSuggestionId, setAiCurrentSuggestionId] = useState<
    string | null
  >(null);
  const [aiShownSuggestionIds, setAiShownSuggestionIds] = useState<string[]>([]);
  const [gachaResult, setGachaResult] = useState("ボウリング");
  const [consentedMembers, setConsentedMembers] = useState(["さくら", "まな", "ゆうき"]);
  const [uploadedName, setUploadedName] = useState("");
  const [nickname, setNickname] = useState("");
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const matchingAiTemplates = useMemo(
    () =>
      filterActivityTemplates({
        budgetLimitYen: aiBudget === "any" ? null : Number(aiBudget),
        participantCount: aiParticipantCount,
        interests: aiInterests,
      }),
    [aiBudget, aiParticipantCount, aiInterests],
  );
  const currentAiTemplate =
    matchingAiTemplates.find(
      (template) => template.id === aiCurrentSuggestionId,
    ) ?? null;
  const currentAiPresentation = currentAiTemplate
    ? AI_INTEREST_PRESENTATION[currentAiTemplate.interestTags[0] ?? "体験"]
    : null;
  const unseenAiTemplates = matchingAiTemplates.filter(
    (template) => !aiShownSuggestionIds.includes(template.id),
  );
  const [candidateDate, setCandidateDate] = useState("");
  const [candidateStart, setCandidateStart] = useState("13:00");
  const [candidateEnd, setCandidateEnd] = useState("16:00");
  const [currentTime, setCurrentTime] = useState(0);
  const [notificationToggles, setNotificationToggles] = useState<Record<string, boolean>>({
    "参加申請・承認": true,
    "企画の変更": true,
    "予定のリマインド": false,
  });
  const datePlan =
    plans.find((plan) => plan.id === selectedPlanId) ??
    plans.find((plan) => plan.group_id === selectedGroupId) ??
    plans[0] ??
    null;
  const datePlanId = datePlan?.id ?? null;
  const dateWorkspaceMatchesSelection = Boolean(
    datePlanId &&
      dateWorkspace?.planId === datePlanId &&
      dateWorkspace.version === dateRefreshVersion,
  );
  const dateCandidates = dateWorkspaceMatchesSelection
    ? dateWorkspace?.data?.candidates ?? []
    : [];
  const dateResponses = dateWorkspaceMatchesSelection
    ? dateWorkspace?.data?.responses ?? []
    : [];
  const dateLoading = Boolean(datePlanId && !dateWorkspaceMatchesSelection);
  const dateError = dateWorkspaceMatchesSelection ? dateWorkspace?.error ?? "" : "";

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        setWorkspaceLoading(true);
        setWorkspaceError("");
      } else {
        setGroups([]);
        setPlans([]);
        setJoinRequests([]);
        setNotifications([]);
        setSelectedGroupId("");
        setNickname("");
        setNeedsNickname(false);
        setFavoritePlaces([]);
        setFavoriteGroupId("");
        setFavoriteError(null);
        setPlaceResults([]);
        setPlaceDetails({});
        setWorkspaceLoading(false);
        setWorkspaceError("");
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(error.message);
      } else {
        setUser(data.session?.user ?? null);
      }
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !invitationToken) return;

    let active = true;
    void supabase
      .rpc("get_group_invitation_preview", { p_token: invitationToken })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setInvitationError(`招待情報を確認できませんでした: ${error.message}`);
        } else if (!data[0]) {
          setInvitationError("招待リンクまたはコードが無効です。");
        } else {
          const preview = {
            groupId: data[0].group_id,
            groupName: data[0].group_name,
            expiresAt: data[0].expires_at,
            alreadyMember: data[0].already_member,
            expired: new Date(data[0].expires_at).getTime() <= Date.now(),
          };
          setInvitationPreview(preview);
          setInvitationError("");
        }
        setInvitationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supabase, invitationToken]);

  useEffect(() => {
    if (!supabase || !user) return;

    let active = true;
    const loadAccount = async () => {
      const profileResult = await supabase
        .from("user_profiles")
        .select("nickname")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      if (profileResult.error) {
        setWorkspaceError(`プロフィールを読み込めませんでした: ${profileResult.error.message}`);
        setWorkspaceLoading(false);
        return;
      }

      if (!profileResult.data) {
        setNeedsNickname(true);
        setNickname("");
        setGroups([]);
        setPlans([]);
        setJoinRequests([]);
        setNotifications([]);
        setWorkspaceLoading(false);
        return;
      }

      setNeedsNickname(false);
      setNickname(profileResult.data.nickname);
      const workspaceResult = await fetchWorkspaceData(supabase, user.id);
      if (!active) return;
      if (workspaceResult.data === null) {
        setWorkspaceError(`グループ・企画を読み込めませんでした: ${workspaceResult.error}`);
        setWorkspaceLoading(false);
        return;
      }

      setGroups(workspaceResult.data.groups);
      setPlans(workspaceResult.data.plans);
      setJoinRequests(workspaceResult.data.joinRequests);
      setNotifications(workspaceResult.data.notifications);
      setSelectedGroupId((current) =>
        workspaceResult.data.groups.some((group) => group.id === current)
          ? current
          : workspaceResult.data.groups[0]?.id ?? "",
      );
      setWorkspaceLoading(false);
    };

    void loadAccount();
    return () => {
      active = false;
    };
  }, [supabase, user]);

  useEffect(() => {
    if (!supabase || !user || !datePlanId) return;

    let active = true;
    void fetchDateWorkspaceData(supabase, datePlanId).then((result) => {
      if (!active) return;
      if (result.data === null) {
        setDateWorkspace({
          planId: datePlanId,
          version: dateRefreshVersion,
          data: null,
          error: `日程情報を読み込めませんでした: ${result.error}`,
        });
      } else {
        setDateWorkspace({
          planId: datePlanId,
          version: dateRefreshVersion,
          data: result.data,
          error: "",
        });
        setSelectedCandidateId((current) =>
          result.data.candidates.some((candidate) => candidate.id === current)
            ? current
            : result.data.candidates[0]?.id ?? "",
        );
      }
    });

    return () => {
      active = false;
    };
  }, [supabase, user, datePlanId, dateRefreshVersion]);

  useEffect(() => {
    if (!supabase || !user || !selectedGroupId) return;

    let active = true;

    const loadFavorites = async () => {
      const favoritesResult = await supabase
        .from("group_favorites")
        .select("group_id, place_id, added_by, created_at")
        .eq("group_id", selectedGroupId)
        .order("created_at", { ascending: false });

      if (!active) return;
      if (favoritesResult.error) {
        setFavoriteError({
          groupId: selectedGroupId,
          message: `お気に入りを読み込めませんでした: ${favoritesResult.error.message}`,
        });
        return;
      }

      if (favoritesResult.data.length === 0) {
        setFavoritePlaces([]);
        setFavoriteGroupId(selectedGroupId);
        setFavoriteError(null);
        return;
      }

      const placeIds = favoritesResult.data.map((favorite) => favorite.place_id);
      const placesResult = await supabase
        .from("places")
        .select("id, provider, provider_place_id")
        .in("id", placeIds);

      if (!active) return;
      if (placesResult.error) {
        setFavoriteError({
          groupId: selectedGroupId,
          message: `場所情報を読み込めませんでした: ${placesResult.error.message}`,
        });
        return;
      }

      const placesById = new Map(placesResult.data.map((place) => [place.id, place]));
      const loadedFavorites = favoritesResult.data.flatMap((favorite) => {
        const place = placesById.get(favorite.place_id);
        return place?.provider === "google_maps"
          ? [{
              groupId: favorite.group_id,
              placeId: favorite.place_id,
              addedBy: favorite.added_by,
              createdAt: favorite.created_at,
              providerPlaceId: place.provider_place_id,
            }]
          : [];
      });

      if (loadedFavorites.length !== favoritesResult.data.length) {
        setFavoriteError({
          groupId: selectedGroupId,
          message: "一部のお気に入りの場所情報を確認できませんでした。",
        });
        return;
      }

      setFavoritePlaces(loadedFavorites);
      setFavoriteGroupId(selectedGroupId);
      setFavoriteError(null);
    };

    void loadFavorites();
    return () => {
      active = false;
    };
  }, [supabase, user, selectedGroupId, favoriteRefreshVersion]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const navigate = (nextScreen: ScreenId) => {
    setScreen(nextScreen);
    setMobileMenuOpen(false);
    setToast("");
  };

  const resetPlaceSearch = () => {
    setPlaceResults([]);
    setHasSearchedPlaces(false);
    setPlaceSearchError("");
    setSelectedSearchMapPlace(null);
  };

  const resetAiSuggestions = () => {
    setAiHasGenerated(false);
    setAiCurrentSuggestionId(null);
    setAiShownSuggestionIds([]);
  };

  const showAiSuggestion = (isAnotherIdea = false) => {
    const candidates = isAnotherIdea
      ? unseenAiTemplates
      : matchingAiTemplates;
    setAiHasGenerated(true);
    if (candidates.length === 0) {
      setAiCurrentSuggestionId(null);
      setAiShownSuggestionIds([]);
      return;
    }

    const selected =
      candidates[Math.floor(Math.random() * candidates.length)];
    if (!selected) {
      setAiCurrentSuggestionId(null);
      setAiShownSuggestionIds([]);
      return;
    }

    setAiCurrentSuggestionId(selected.id);
    setAiShownSuggestionIds((shownIds) =>
      isAnotherIdea ? [...shownIds, selected.id] : [selected.id],
    );
  };

  const toggleAiInterest = (interest: ActivityInterest) => {
    resetAiSuggestions();
    setAiInterests((interests) =>
      interests.includes(interest)
        ? interests.filter((item) => item !== interest)
        : [...interests, interest],
    );
  };

  const openPlacesFromAi = () => {
    setQuery("");
    setPlaceArea(aiArea.trim());
    if (aiArea.trim()) {
      setPlaceLocationMode("area");
    }
    resetPlaceSearch();
    navigate("places");
  };

  const searchPlaces = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const searchQuery = query.trim();
    if (!searchQuery) {
      setPlaceSearchError("検索キーワードを入力してください。");
      return;
    }
    if (placeLocationMode === "area" && !placeArea.trim()) {
      setPlaceSearchError("検索する地域を入力してください。");
      return;
    }
    if (!supabase || !user || !selectedGroupId) {
      setPlaceSearchError("検索するにはログインしてグループを選択してください。");
      return;
    }

    setSelectedSearchMapPlace(null);
    setPlaceSearchLoading(true);
    setPlaceSearchError("");
    setHasSearchedPlaces(true);
    setPlaceResults([]);
    try {
      const location: PlaceSearchLocationInput = placeLocationMode === "area"
        ? { mode: "area", area: placeArea.trim() }
        : { mode: "current", ...(await getCurrentPlaceLocation()) };
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          groupId: selectedGroupId,
          query: searchQuery,
          category: placeCategory,
          radiusKm: placeRadiusKm,
          location,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "場所を検索できませんでした。";
        throw new Error(message);
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("places" in payload) ||
        !Array.isArray(payload.places) ||
        !payload.places.every(isPlaceSearchResult)
      ) {
        throw new Error("場所検索の応答形式が正しくありません。");
      }
      setPlaceResults(payload.places);
    } catch (error) {
      setPlaceSearchError(
        error instanceof Error ? error.message : "場所を検索できませんでした。",
      );
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const toggleFavorite = async (place: PlaceSummary) => {
    if (!supabase || !user || !selectedGroupId) {
      showToast("お気に入り登録にはログインとグループ選択が必要です。");
      return;
    }

    const favorite = favoriteGroupId === selectedGroupId
      ? favoritePlaces.find((item) => item.providerPlaceId === place.id)
      : undefined;
    if (favorite) {
      const selectedGroup = groups.find((group) => group.id === favorite.groupId);
      if (favorite.addedBy !== user.id && selectedGroup?.role !== "admin") {
        showToast("登録者またはグループ管理者のみ削除できます。");
        return;
      }

      const { error } = await supabase
        .from("group_favorites")
        .delete()
        .eq("group_id", favorite.groupId)
        .eq("place_id", favorite.placeId);
      if (error) {
        showToast(`お気に入りを削除できませんでした: ${error.message}`);
        return;
      }

      setFavoritePlaces((current) => current.filter((item) => item.placeId !== favorite.placeId));
      setSelectedFavoriteMapPlace((current) =>
        current?.id === favorite.providerPlaceId ? null : current,
      );
      setSelectedSearchMapPlace((current) =>
        current?.id === favorite.providerPlaceId ? null : current,
      );
      showToast("お気に入りから削除しました。");
      return;
    }

    const placeResult = await supabase.rpc("get_or_create_place", {
      p_provider: "google_maps",
      p_provider_place_id: place.id,
    });
    if (placeResult.error || !placeResult.data) {
      showToast(`場所を保存できませんでした: ${placeResult.error?.message ?? "場所IDを取得できませんでした。"}`);
      return;
    }

    const favoriteResult = await supabase
      .from("group_favorites")
      .insert({ group_id: selectedGroupId, place_id: placeResult.data });
    if (favoriteResult.error) {
      if (favoriteResult.error.code === "23505") {
        setFavoriteGroupId("");
        setFavoriteRefreshVersion((version) => version + 1);
        showToast("この場所はすでにお気に入りに登録されています。");
      } else {
        showToast(`お気に入りを登録できませんでした: ${favoriteResult.error.message}`);
      }
      return;
    }

    setPlaceDetails((current) => ({ ...current, [place.id]: place }));
    setFavoriteGroupId("");
    setFavoriteRefreshVersion((version) => version + 1);
    showToast("グループのお気に入りに登録しました。");
  };

  const loadFavoriteDetails = async (favorite: GroupFavoritePlace) => {
    if (placeDetails[favorite.providerPlaceId]) return;

    setFavoriteDetailLoadingIds((current) => [...current, favorite.placeId]);
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "details",
          groupId: favorite.groupId,
          favoritePlaceId: favorite.placeId,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "場所情報を取得できませんでした。";
        throw new Error(message);
      }
      const loadedPlace =
        typeof payload === "object" && payload !== null && "place" in payload
          ? payload.place
          : null;
      if (
        typeof payload !== "object" ||
        payload === null ||
        !isPlaceSummary(loadedPlace) ||
        loadedPlace.id !== favorite.providerPlaceId
      ) {
        throw new Error("場所情報の応答形式が正しくありません。");
      }
      setPlaceDetails((current) => ({
        ...current,
        [favorite.providerPlaceId]: loadedPlace,
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "場所情報を取得できませんでした。");
    } finally {
      setFavoriteDetailLoadingIds((current) => current.filter((id) => id !== favorite.placeId));
    }
  };

  const refreshWorkspace = async (preferredGroupId?: string) => {
    if (!supabase || !user) return false;
    setWorkspaceLoading(true);
    const result = await fetchWorkspaceData(supabase, user.id);
    if (result.data === null) {
      setWorkspaceError(`データを更新できませんでした: ${result.error}`);
      setWorkspaceLoading(false);
      return false;
    }

    setWorkspaceError("");
    setGroups(result.data.groups);
    setPlans(result.data.plans);
    setJoinRequests(result.data.joinRequests);
    setNotifications(result.data.notifications);
    setSelectedGroupId((current) => {
      if (preferredGroupId && result.data.groups.some((group) => group.id === preferredGroupId)) {
        return preferredGroupId;
      }
      return result.data.groups.some((group) => group.id === current)
        ? current
        : result.data.groups[0]?.id ?? "";
    });
    setWorkspaceLoading(false);
    return true;
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    setAuthError("");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set(
      "next",
      invitationToken ? `/invite/${encodeURIComponent(invitationToken)}` : "/",
    );
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setAuthError(
        error.message.includes("provider is not enabled")
          ? "SupabaseでGoogleログインが無効です。AuthenticationのGoogle Providerを有効にして、Client IDとSecretを設定してください。"
          : `Googleログインを開始できませんでした: ${error.message}`,
      );
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) showToast(`ログアウトできませんでした: ${error.message}`);
  };

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !newGroupName.trim()) return;

    const { data: groupId, error } = await supabase.rpc("create_group", {
      p_name: newGroupName.trim(),
    });
    if (error) {
      showToast(`グループを作成できませんでした: ${error.message}`);
      return;
    }

    setNewGroupName("");
    const refreshed = await refreshWorkspace(groupId);
    if (refreshed) showToast("グループを作成しました");
  };

  const createPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !selectedGroupId) {
      showToast("先にグループを作成してください");
      return;
    }

    const deadline = responseDeadline ? new Date(responseDeadline) : null;
    if (deadline && (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now())) {
      showToast("回答締切は未来の日時を指定してください");
      return;
    }

    const { data, error } = await supabase
      .from("plans")
      .insert({
        group_id: selectedGroupId,
        title: planTitle.trim(),
        description: planDescription.trim() || null,
        response_deadline: deadline?.toISOString() ?? null,
      })
      .select("id")
      .single();
    if (error) {
      showToast(`企画を保存できませんでした: ${error.message}`);
      return;
    }

    const savedTitle = planTitle.trim();
    setPlanTitle("");
    setPlanDescription("");
    setResponseDeadline("");
    setSelectedPlanId(data.id);
    await refreshWorkspace();
    navigate("plans");
    showToast(`「${savedTitle}」を保存しました`);
  };

  const saveNickname = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || !nickname.trim()) return;

    const profileResult = needsNickname
      ? await supabase
          .from("user_profiles")
          .insert({ id: user.id, nickname: nickname.trim() })
          .select("id")
          .single()
      : await supabase
          .from("user_profiles")
          .update({ nickname: nickname.trim() })
          .eq("id", user.id)
          .select("id")
          .single();
    const { error } = profileResult;
    if (error) {
      const message = `プロフィールを保存できませんでした: ${error.message}`;
      if (needsNickname) setWorkspaceError(message);
      else showToast(message);
      return;
    }
    setNickname(nickname.trim());
    setNeedsNickname(false);
    setWorkspaceError("");
    await refreshWorkspace();
    showToast("プロフィールを保存しました");
  };

  const openCandidateEditor = (candidate?: DateCandidateRecord) => {
    if (candidate) {
      const start = toLocalDateTimeParts(candidate.starts_at);
      const end = toLocalDateTimeParts(candidate.ends_at);
      setEditingCandidateId(candidate.id);
      setCandidateDate(start.date);
      setCandidateStart(start.time);
      setCandidateEnd(end.time);
    } else {
      setEditingCandidateId(null);
      setCandidateDate("");
      setCandidateStart("13:00");
      setCandidateEnd("16:00");
    }
    setDateModalOpen(true);
  };

  const saveCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || !datePlan) {
      showToast("日程を登録する企画を選択してください");
      return;
    }

    const canEditPlan =
      datePlan.status === "planning" || datePlan.created_by === user.id;
    if (!canEditPlan) {
      showToast("予定確定後の日程候補は企画作成者のみ編集できます");
      return;
    }
    if (candidateDate < toLocalDateInputValue(currentTimestamp())) {
      showToast("今日より前の日付は選べません");
      return;
    }

    const startsAt = new Date(`${candidateDate}T${candidateStart}`);
    const endsAt = new Date(`${candidateDate}T${candidateEnd}`);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      showToast("終了日時は開始日時より後にしてください");
      return;
    }

    setSavingCandidate(true);
    const result = editingCandidateId
      ? await supabase
          .from("plan_date_candidates")
          .update({
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
          })
          .eq("id", editingCandidateId)
      : await supabase.from("plan_date_candidates").insert({
          plan_id: datePlan.id,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        });
    setSavingCandidate(false);
    if (result.error) {
      showToast(`候補日時を保存できませんでした: ${result.error.message}`);
      return;
    }

    setDateModalOpen(false);
    setEditingCandidateId(null);
    setCandidateDate("");
    setDateRefreshVersion((current) => current + 1);
    showToast(editingCandidateId ? "候補日時を更新しました" : "候補日時を追加しました");
  };

  const saveDateResponse = async (candidateId: string, response: DateResponse) => {
    if (!supabase || !user || !datePlan) return;

    const deadlinePassed =
      datePlan.response_deadline !== null &&
      Date.parse(datePlan.response_deadline) <= currentTimestamp();
    if (datePlan.status !== "planning" || deadlinePassed) {
      setCurrentTime(currentTimestamp());
      showToast(deadlinePassed ? "回答締切を過ぎています" : "予定確定後は回答を変更できません");
      return;
    }

    setSavingVoteCandidateId(candidateId);
    const existingResponseResult = await supabase
      .from("plan_date_responses")
      .select("candidate_id")
      .eq("candidate_id", candidateId)
      .eq("user_id", user.id)
      .maybeSingle();
    let responseError: string | null = existingResponseResult.error?.message ?? null;

    if (!responseError && existingResponseResult.data) {
      const updateResult = await supabase
        .from("plan_date_responses")
        .update({ response })
        .eq("candidate_id", candidateId)
        .eq("user_id", user.id);
      responseError = updateResult.error?.message ?? null;
    } else if (!responseError) {
      const insertResult = await supabase.from("plan_date_responses").insert({
        candidate_id: candidateId,
        user_id: user.id,
        response,
      });
      if (insertResult.error?.code === "23505") {
        const retryResult = await supabase
          .from("plan_date_responses")
          .update({ response })
          .eq("candidate_id", candidateId)
          .eq("user_id", user.id);
        responseError = retryResult.error?.message ?? null;
      } else {
        responseError = insertResult.error?.message ?? null;
      }
    }

    setSavingVoteCandidateId("");
    if (responseError) {
      showToast(`回答を保存できませんでした: ${responseError}`);
      return;
    }

    setCurrentTime(currentTimestamp());
    setSelectedCandidateId(candidateId);
    setDateRefreshVersion((current) => current + 1);
    showToast("日程の回答を保存しました");
  };

  const createInvitation = async () => {
    if (!supabase || !selectedGroup) return;
    const { data, error } = await supabase.rpc("create_group_invitation", {
      p_group_id: selectedGroup.id,
    });
    if (error) {
      showToast(`招待を発行できませんでした: ${error.message}`);
      return;
    }

    const invitation = data[0];
    if (!invitation) {
      showToast("招待情報を取得できませんでした。もう一度お試しください。");
      return;
    }

    setIssuedInvitation({
      token: invitation.token,
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
      expiresAt: invitation.expires_at,
      alreadyMember: false,
      expired: false,
    });
    setInviteCopied(false);
    showToast("7日間有効な招待を発行しました");
  };

  const invitationUrl = issuedInvitation
    ? `${typeof window === "undefined" ? "" : window.location.origin}/invite/${issuedInvitation.token}`
    : "";

  const handleInviteCopy = () => {
    if (!invitationUrl || !navigator.clipboard) {
      showToast("招待を先に発行するか、ブラウザーの共有機能をご利用ください");
      return;
    }
    void navigator.clipboard
      .writeText(invitationUrl)
      .then(() => {
        setInviteCopied(true);
        showToast("招待リンクをコピーしました");
      })
      .catch(() => showToast("コピーできませんでした。ブラウザーの権限を確認してください。"));
  };

  const handleInviteShare = () => {
    if (!invitationUrl || !issuedInvitation) {
      showToast("招待を先に発行してください");
      return;
    }
    if (!navigator.share) {
      handleInviteCopy();
      return;
    }
    void navigator
      .share({
        title: `${issuedInvitation.groupName}への招待`,
        text: `${issuedInvitation.groupName}に参加申請してください。`,
        url: invitationUrl,
      })
      .then(() => showToast("招待リンクを共有しました"))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        showToast("招待リンクを共有できませんでした");
      });
  };

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = joinCode.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setInvitationError("招待コードは64桁の16進数で入力してください。");
      return;
    }
    if (token !== invitationToken) {
      router.push(`/invite/${token}`);
    }
  };

  const submitJoinRequest = async () => {
    if (!supabase || !user || !invitationToken || !invitationPreview) return;
    if (invitationPreview.expired) {
      setInvitationError("この招待は期限切れです。グループ管理者に新しい招待を依頼してください。");
      return;
    }
    if (invitationPreview.alreadyMember) {
      setSelectedGroupId(invitationPreview.groupId);
      navigate("groups");
      return;
    }

    const existingRequest = joinRequests.find(
      (request) => request.groupId === invitationPreview.groupId && request.userId === user.id,
    );
    if (existingRequest) {
      showToast(
        existingRequest.status === "pending"
          ? "このグループへの参加申請は確認中です。"
          : existingRequest.status === "approved"
            ? "このグループへの参加は承認済みです。"
            : "この招待の参加申請は拒否されています。",
      );
      return;
    }

    const { error } = await supabase.rpc("submit_group_join_request", {
      p_token: invitationToken,
    });
    if (error) {
      const message = error.message.includes("invalid or expired")
        ? "招待リンクまたはコードが無効、または期限切れです。"
        : error.message.includes("already a group member")
          ? "すでにこのグループのメンバーです。"
          : `参加申請を送信できませんでした: ${error.message}`;
      setInvitationError(message);
      return;
    }

    await refreshWorkspace();
    showToast("参加申請を送信しました。管理者の承認をお待ちください。");
  };

  const decideJoinRequest = async (requestId: string, approve: boolean) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("decide_group_join_request", {
      p_request_id: requestId,
      p_approve: approve,
    });
    if (error) {
      showToast(`申請を処理できませんでした: ${error.message}`);
      return;
    }
    await refreshWorkspace();
    showToast(approve ? "参加申請を承認しました" : "参加申請を拒否しました");
  };

  const markNotificationRead = async (notificationId: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("notification_deliveries")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .select("id")
      .single();
    if (error) {
      showToast(`通知を既読にできませんでした: ${error.message}`);
      return;
    }
    setNotifications((current) =>
      current.map((notice) =>
        notice.id === notificationId
          ? { ...notice, readAt: new Date().toISOString() }
          : notice,
      ),
    );
  };

  const markAllNotificationsRead = async () => {
    if (!supabase) return;
    const unreadIds = notifications.filter((notice) => !notice.readAt).map((notice) => notice.id);
    if (unreadIds.length === 0) return;

    const readAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("notification_deliveries")
      .update({ read_at: readAt })
      .in("id", unreadIds)
      .select("id");
    if (error) {
      showToast(`通知を既読にできませんでした: ${error.message}`);
      return;
    }
    if (data.length !== unreadIds.length) {
      showToast("一部の通知を既読にできませんでした。再読み込みしてください。");
      return;
    }
    setNotifications((current) =>
      current.map((notice) => ({ ...notice, readAt: notice.readAt ?? readAt })),
    );
  };

  const openNotification = (notice: NotificationRecord) => {
    const request = joinRequests.find((item) => item.id === notice.groupJoinRequestId);
    if (notice.eventType === "join_request_received" && request) {
      setSelectedGroupId(request.groupId);
      navigate("groups");
      return;
    }
    if (
      notice.eventType === "join_request_decided" &&
      request?.status === "approved" &&
      groups.some((group) => group.id === request.groupId)
    ) {
      setSelectedGroupId(request.groupId);
      navigate("groups");
      return;
    }
    showToast(notice.body);
  };

  const toggleActivity = (activity: string) => {
    setSelectedActivities((current) =>
      current.includes(activity)
        ? current.filter((item) => item !== activity)
        : [...current, activity],
    );
  };

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const selectedGroupPlans = plans.filter((plan) => plan.group_id === selectedGroupId);
  const datePlanGroup = groups.find((group) => group.id === datePlan?.group_id);
  const dateDeadlinePassed = Boolean(
    datePlan?.response_deadline &&
      currentTime > 0 &&
      Date.parse(datePlan.response_deadline) <= currentTime,
  );
  const canEditDateCandidates = Boolean(
    datePlan &&
      user &&
      (datePlan.status === "planning" || datePlan.created_by === user.id),
  );
  const canRespondToDates = Boolean(
    datePlan && datePlan.status === "planning" && !dateDeadlinePassed,
  );
  const minimumCandidateDate =
    currentTime > 0 ? toLocalDateInputValue(currentTime) : undefined;
  const rankedDateCandidatesWithRank = rankDateCandidates(dateCandidates, dateResponses);
  const focusedCandidate =
    rankedDateCandidatesWithRank.find((candidate) => candidate.id === selectedCandidateId) ??
    rankedDateCandidatesWithRank[0] ??
    null;
  const focusedResponseByUser = new Map(
    focusedCandidate?.responses.map((response) => [response.user_id, response.response]) ?? [],
  );
  const unreadNotifications = notifications.filter((notice) => !notice.readAt).length;
  const pendingJoinRequests = joinRequests.filter(
    (request) => request.groupId === selectedGroupId && request.status === "pending",
  );

  const pageContent = (() => {
    switch (screen) {
      case "home":
        return (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="hero-kicker">FRIENDS, PLANS & GOOD DAYS</span>
                <h1>次の遊びは、<br />みんなで決めよう。</h1>
                <p>日程も行き先も、あわそで一緒に。</p>
                <button className="button button-lime" type="button" onClick={() => navigate(selectedGroup ? "create" : "groups")}>
                  <Icon name="plus" /> 企画をつくる
                </button>
              </div>
              <div className="hero-scene" aria-hidden="true">
                <div className="hero-moon" />
                <div className="hero-orbit orbit-one" />
                <div className="hero-orbit orbit-two" />
                <div className="hero-hill hill-back" />
                <div className="hero-hill hill-front" />
                <span className="hero-star star-one">✦</span>
                <span className="hero-star star-two">✦</span>
                <span className="hero-slogan">あそびの予定は<br /><strong>あわそ。</strong></span>
              </div>
            </section>

            <div className="dashboard-grid">
              <section className="panel quick-panel">
                <SectionHeading title="さっそく始めよう" />
                <div className="quick-actions">
                  {[
                    { label: "日程を決める", hint: "みんなの予定を集める", icon: "calendar" as const, screen: "dates" as const },
                    { label: "場所を探す", hint: "お店・駐車場を検索", icon: "map" as const, screen: "places" as const },
                    { label: "ガチャを回す", hint: "遊びのヒントを発見", icon: "shuffle" as const, screen: "gacha" as const },
                    { label: "AIに相談する", hint: "条件からアイデア提案", icon: "sparkles" as const, screen: "ai" as const },
                  ].map((action) => (
                    <button className="quick-action" key={action.label} type="button" onClick={() => navigate(action.screen)}>
                      <span className="quick-icon"><Icon name={action.icon} /></span>
                      <span><strong>{action.label}</strong><small>{action.hint}</small></span>
                      <Icon name="chevron" className="quick-chevron" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel group-panel">
                <SectionHeading title="いつものグループ" action={<button className="text-action" type="button" onClick={() => navigate("groups")}>すべて見る <Icon name="chevron" /></button>} />
                <div className="group-preview">
                  <div className="group-cover">
                    <span className="group-cover-icon">🌴</span>
                    <span className="online-dot" />
                  </div>
                  <div className="group-preview-copy">
                    <div className="title-inline"><h3>{selectedGroup?.name ?? "グループ未作成"}</h3><span className="status-pill">{selectedGroup?.members.length ?? 0}人</span></div>
                    <p>{selectedGroup ? "次の遊び、みんなで計画中" : "グループを作成して企画を始めよう"}</p>
                    <div className="avatar-stack">
                      {selectedGroup?.members.slice(0, 4).map((member, index) => <Avatar key={member.userId} initials={member.nickname.slice(0, 1)} color={members[index % members.length].color} size="small" />)}
                      <button className="avatar-add" type="button" aria-label="グループを管理する" onClick={() => navigate("groups")}><Icon name="plus" /></button>
                    </div>
                  </div>
                </div>
                <div className="divider" />
                <div className="inline-status"><span className="status-dot status-dot-lime" /> 保存済みの企画 <strong>{selectedGroupPlans.length}件</strong><button className="text-action" type="button" onClick={() => navigate("plans")}>一覧を見る <Icon name="chevron" /></button></div>
              </section>

              <section className="panel upcoming-panel">
                <SectionHeading title="進行中の企画" action={<button className="text-action" type="button" onClick={() => navigate("plans")}>一覧を見る <Icon name="chevron" /></button>} />
                {selectedGroupPlans.slice(0, 2).map((plan, index) => <button className="plan-row" key={plan.id} type="button" onClick={() => navigate("plans")}><div className={`plan-art ${index % 2 === 0 ? "art-sunset" : "art-ocean"}`}><span>{index % 2 === 0 ? "✦" : "🌊"}</span></div><div className="plan-row-copy"><span className="tiny-tag tag-lime">{plan.status === "confirmed" ? "予定確定" : "企画中"}</span><h3>{plan.title}</h3><p><Icon name="clock" /> {new Date(plan.created_at).toLocaleDateString("ja-JP")}</p></div><Icon name="chevron" className="muted-icon" /></button>)}
                {selectedGroupPlans.length === 0 && <div className="empty-state"><span>＋</span><strong>企画はまだありません</strong><p>最初の企画を作ってみましょう。</p></div>}
              </section>

              <section className="panel inspiration-panel">
                <div className="inspiration-visual">
                  <div className="inspiration-sun" />
                  <div className="inspiration-lines" />
                  <span className="inspiration-label">IDEA OF THE DAY</span>
                  <span className="inspiration-text">夕焼けを見ながら<br /><b>海辺でBBQ</b></span>
                </div>
                <div className="inspiration-footer"><span>今日のおすすめ</span><button className="icon-button" type="button" aria-label="別のおすすめを見る" onClick={() => navigate("gacha")}><Icon name="shuffle" /></button></div>
              </section>
            </div>
          </>
        );

      case "groups":
        return (
          <>
            <PageHeading
              eyebrow="YOUR CIRCLE"
              title="グループ"
              description="グループを作成して、企画や予定を保存しよう。"
            />
            <section className="panel group-create-panel">
              <form className="group-create-form" onSubmit={createGroup}>
                <div><h2>新しいグループ</h2><p>作成したグループの管理者になります。</p></div>
                <label className="sr-only" htmlFor="new-group-name">グループ名</label>
                <input className="input-control" id="new-group-name" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="例）あわそグループ" maxLength={60} required />
                <button className="button button-lime" type="submit" disabled={workspaceLoading}><Icon name="plus" /> 作成</button>
              </form>
            </section>
            <div className="inline-callout"><span className="callout-icon"><Icon name="groups" /></span><p><strong>招待コードをお持ちですか？</strong><br />コードまたは招待リンクから参加申請できます。</p><button className="button button-outline" type="button" onClick={() => navigate("join")}>招待を確認 <Icon name="arrow" /></button></div>
            {groups.length > 1 && <div className="group-switcher" role="group" aria-label="表示するグループ">{groups.map((group) => <button className={`filter-chip ${group.id === selectedGroupId ? "is-active" : ""}`} key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)}>{group.name}</button>)}</div>}
            {selectedGroup ? (
              <>
                <section className="group-feature panel">
                  <div className="group-banner-art"><span>🌴</span><i>✦</i><b>AWASO<br />CREW</b></div>
                  <div className="group-feature-body">
                    <div className="group-feature-heading"><div><span className="eyebrow">{selectedGroup.role === "admin" ? "GROUP ADMIN" : "MY GROUP"}</span><h2>{selectedGroup.name}</h2><p>メンバーと一緒に企画を作成できます。</p></div></div>
                    <div className="member-line">
                      <div className="avatar-stack">{selectedGroup.members.slice(0, 5).map((member, index) => <Avatar key={member.userId} initials={member.nickname.slice(0, 1)} color={members[index % members.length].color} />)}<span className="member-count">{selectedGroup.members.length}人</span></div>
                      <div className="group-actions">{selectedGroup.role === "admin" && <button className="button button-outline" type="button" onClick={() => navigate("invite")}><Icon name="user" /> 招待する</button>}<button className="button button-lime" type="button" onClick={() => navigate("create")}><Icon name="plus" /> 企画を作成する</button></div>
                    </div>
                  </div>
                </section>
                {selectedGroup.role === "admin" && <section className="panel group-members-panel"><SectionHeading title="参加申請" action={<span className="count-pill">{pendingJoinRequests.length}</span>} />{pendingJoinRequests.length > 0 ? <div className="request-list">{pendingJoinRequests.map((request) => <article className="request-row" key={request.id}><Avatar initials={request.requesterNickname.slice(0, 1)} color="avatar-purple" size="small" /><div><strong>{request.requesterNickname}</strong><small>{new Date(request.requestedAt).toLocaleString("ja-JP")}</small></div><div className="request-actions"><button className="button button-outline button-small" type="button" onClick={() => void decideJoinRequest(request.id, false)}>拒否</button><button className="button button-lime button-small" type="button" onClick={() => void decideJoinRequest(request.id, true)}>承認</button></div></article>)}</div> : <p className="panel-subtitle">現在、承認待ちの申請はありません。</p>}</section>}
                <section className="panel group-members-panel">
                  <SectionHeading title="メンバー" action={<span className="count-pill">{selectedGroup.members.length}</span>} />
                  <div className="member-grid">
                    {selectedGroup.members.map((member, index) => <div className="member-card" key={member.userId}><Avatar initials={member.nickname.slice(0, 1)} color={members[index % members.length].color} size="large" /><strong>{member.nickname}</strong><span>{member.role === "admin" ? "管理者" : "メンバー"}</span></div>)}
                  </div>
                </section>
              </>
            ) : (
              <div className="panel empty-state"><span>◉</span><strong>グループはまだありません</strong><p>上のフォームからグループを作成してください。</p></div>
            )}
          </>
        );

      case "invite":
        return (
          <>
            <button className="back-link" type="button" onClick={() => navigate("groups")}><Icon name="chevron" /> グループに戻る</button>
            <div className="narrow-page">
              <PageHeading eyebrow="INVITE YOUR FRIENDS" title="友だちを招待しよう" description="リンクやQRコードを共有して、グループへの参加を申請してもらいましょう。" />
              <section className="panel invite-panel">
                {groups.length > 1 && <><label className="field-label" htmlFor="invite-group">招待するグループ</label><select className="input-control" id="invite-group" value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setIssuedInvitation(null); }}><option value="">グループを選択</option>{groups.filter((group) => group.role === "admin").map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></>}
                {selectedGroup?.role === "admin" ? (
                  <>
                    <div className="invite-group-card"><div className="group-cover group-cover-small">🌴</div><div><h2>{selectedGroup.name}</h2><p><Icon name="user" /> メンバー {selectedGroup.members.length}人</p></div><span className="status-pill">管理者</span></div>
                    {issuedInvitation?.groupId === selectedGroup.id ? (
                      <>
                        <label className="field-label" htmlFor="invite-link">招待リンク</label>
                        <div className="copy-field"><Icon name="external" /><input id="invite-link" readOnly value={invitationUrl} /><button className="button button-lime button-small" type="button" onClick={handleInviteCopy}><Icon name={inviteCopied ? "check" : "copy"} /> {inviteCopied ? "コピー済み" : "コピー"}</button></div>
                        <p className="field-hint">有効期限：{new Date(issuedInvitation.expiresAt).toLocaleString("ja-JP")}</p>
                        <div className="invite-divider"><span>招待コード</span></div>
                        <div className="invite-code-wrap"><div><span className="field-label">リンクを開けない場合に入力</span><strong className="invite-code invite-code-long">{issuedInvitation.token}</strong></div><button className="icon-button" type="button" aria-label="招待コードをコピー" onClick={() => { void navigator.clipboard?.writeText(issuedInvitation.token).then(() => showToast("招待コードをコピーしました")).catch(() => showToast("コードをコピーできませんでした")); }}><Icon name="copy" /></button></div>
                        <div className="qr-card"><div className="real-qr-code"><QRCodeSVG value={invitationUrl} size={144} level="M" /></div><p><strong>QRコードを読み込んで参加申請</strong><br />QRコードには招待リンクが含まれます。</p><Icon name="arrow" /></div>
                        <button className="button button-lime button-full" type="button" onClick={handleInviteShare}><Icon name="send" /> 招待リンクを共有</button>
                      </>
                    ) : (
                      <button className="button button-lime button-full" type="button" onClick={() => void createInvitation()}><Icon name="plus" /> 7日間有効な招待を発行</button>
                    )}
                  </>
                ) : <div className="empty-state"><span>◉</span><strong>管理者のみ招待を発行できます</strong><p>グループ管理者に招待リンクの発行を依頼してください。</p></div>}
              </section>
            </div>
          </>
        );

      case "join":
        return (
          <>
            <button className="back-link" type="button" onClick={() => navigate("groups")}><Icon name="chevron" /> グループに戻る</button>
            <div className="narrow-page">
              <PageHeading eyebrow="JOIN A GROUP" title="友だちのグループに参加" description="招待リンクまたはコードを確認して、参加申請を送ろう。" />
              <section className="panel join-panel">
                {!invitationToken ? (
                  <>
                    <div className="join-illustration"><span>✦</span><div className="join-orbit"><Icon name="groups" /></div><i>✦</i></div>
                    <h2>招待コードをもらった？</h2>
                    <p>招待リンクを開くか、64桁のコードを入力してください。</p>
                    {invitationError && <div className="auth-error" role="alert">{invitationError}</div>}
                    <form onSubmit={handleJoin}>
                      <label className="field-label" htmlFor="join-code">招待コード</label>
                      <input className="input-control input-code" id="join-code" placeholder="64桁の招待コード" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} maxLength={64} required />
                      <button className="button button-lime button-full" type="submit"><Icon name="search" /> 招待を確認 <Icon name="chevron" /></button>
                    </form>
                  </>
                ) : invitationLoading ? (
                  <div className="workspace-loading" role="status">招待情報を確認しています…</div>
                ) : invitationError ? (
                  <div className="auth-error" role="alert">{invitationError}</div>
                ) : invitationPreview ? (
                  <>
                    <div className="join-illustration"><span>✦</span><div className="join-orbit"><Icon name="groups" /></div><i>✦</i></div>
                    <span className="eyebrow">GROUP INVITATION</span>
                    <h2>{invitationPreview.groupName}</h2>
                    <p>このグループへの招待です。有効期限：{new Date(invitationPreview.expiresAt).toLocaleString("ja-JP")}</p>
                    {invitationPreview.alreadyMember ? (
                      <button className="button button-lime button-full" type="button" onClick={() => { setSelectedGroupId(invitationPreview.groupId); navigate("groups"); }}>グループ詳細を見る <Icon name="chevron" /></button>
                    ) : invitationPreview.expired ? (
                      <div className="auth-error" role="alert">この招待は期限切れです。グループ管理者に新しい招待を依頼してください。</div>
                    ) : joinRequests.some((request) => request.groupId === invitationPreview.groupId && request.userId === user?.id) ? (
                      <div className="notice-box"><Icon name="clock" /><span>{joinRequests.find((request) => request.groupId === invitationPreview.groupId && request.userId === user?.id)?.status === "pending" ? "参加申請は管理者の確認待ちです。" : "この招待に対する参加申請はすでに判断されています。"}</span></div>
                    ) : (
                      <>
                        <div className="notice-box"><Icon name="user" /><span>参加申請後、グループ管理者が承認するとメンバーになれます。</span></div>
                        {invitationError && <div className="auth-error" role="alert">{invitationError}</div>}
                        <button className="button button-lime button-full" type="button" onClick={() => void submitJoinRequest()}><Icon name="groups" /> このグループに参加申請</button>
                      </>
                    )}
                  </>
                ) : null}
                {!invitationToken && <p className="fine-print">招待の有効期間は発行から7日間です。参加はグループ管理者の承認後に完了します。</p>}
              </section>
            </div>
          </>
        );

      case "plans":
        return (
          <>
            <PageHeading eyebrow="PLAN TOGETHER" title="企画一覧" description="グループで作成した企画を確認できます。" action={<button className="button button-lime" type="button" disabled={!selectedGroup} onClick={() => navigate(selectedGroup ? "create" : "groups")}><Icon name="plus" /> 企画を作成</button>} />
            <div className="filter-row">
              <span className="filter-chip is-active">企画 {selectedGroupPlans.length}件</span>
              <div className="filter-spacer" />
              {groups.length > 1 ? <select className="input-control group-select" aria-label="グループを選択" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : <span className="button button-outline button-small"><Icon name="groups" /> {selectedGroup?.name ?? "グループ未選択"}</span>}
            </div>
            <div className="plan-card-grid">
              {selectedGroupPlans.map((plan, index) => (
                <button className="plan-card" key={plan.id} type="button" onClick={() => { setSelectedPlanId(plan.id); navigate("dates"); }}>
                  <div className={`plan-card-cover ${index % 2 === 0 ? "art-sunset" : "art-ocean"}`}><span>{index % 2 === 0 ? "✦" : "🌊"}</span><b className="tiny-tag tag-lime">{plan.status === "confirmed" ? "予定確定" : "企画中"}</b></div>
                  <div className="plan-card-content"><h2>{plan.title}</h2><p><Icon name="clock" /> 作成日 {new Date(plan.created_at).toLocaleDateString("ja-JP")}</p><p><Icon name="groups" /> {groups.find((group) => group.id === plan.group_id)?.name}</p><div className="plan-card-footer"><span>{plan.description || "企画の詳細は未入力です"}</span></div></div>
                </button>
              ))}
              {selectedGroupPlans.length === 0 && <div className="panel empty-state"><span>▤</span><strong>企画はまだありません</strong><p>企画を作成すると、ここに保存されます。</p></div>}
              <button className="new-plan-card" type="button" onClick={() => navigate(selectedGroup ? "create" : "groups")}><span className="new-plan-plus"><Icon name="plus" /></span><strong>新しい企画をつくる</strong><small>{selectedGroup ? "企画名と内容を保存" : "先にグループを作成"}</small></button>
            </div>
          </>
        );

      case "create":
        return (
          <>
            <button className="back-link" type="button" onClick={() => navigate("plans")}><Icon name="chevron" /> 企画一覧に戻る</button>
            <PageHeading eyebrow="START A NEW PLAN" title="企画を作成" description="まずはどんな遊びをするか、みんなに共有しよう。" />
            <form className="create-layout" onSubmit={createPlan}>
              <section className="panel form-panel">
                <div className="form-section-title"><span>01</span><div><h2>企画の基本情報</h2><p>あとからいつでも編集できます。</p></div></div>
                <label className="field-label" htmlFor="plan-group">保存先グループ <span className="required-mark">必須</span></label>
                <select className="input-control" id="plan-group" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} required disabled={groups.length === 0}>
                  {groups.length === 0 ? <option value="">グループを先に作成してください</option> : groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
                {groups.length === 0 && <button className="text-action" type="button" onClick={() => navigate("groups")}>グループを作成する <Icon name="chevron" /></button>}
                <label className="field-label" htmlFor="plan-title">企画名 <span className="required-mark">必須</span></label>
                <input className="input-control" id="plan-title" placeholder="例）週末バーベキュー" value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} required maxLength={50} />
                <div className="form-meta"><span>みんながわかりやすい名前をつけよう。</span><span>{planTitle.length}/50</span></div>
                <label className="field-label" htmlFor="plan-description">遊びの内容 <span className="optional-mark">任意</span></label>
                <textarea className="input-control textarea-control" id="plan-description" placeholder="例）海辺でおいしいものを食べて、のんびり過ごしたい！" value={planDescription} onChange={(event) => setPlanDescription(event.target.value)} maxLength={200} />
                <div className="form-meta"><span>みんなに伝えたいことを書いてね。</span><span>{planDescription.length}/200</span></div>
                <label className="field-label" htmlFor="plan-response-deadline">回答締切 <span className="optional-mark">任意</span></label>
                <input className="input-control" id="plan-response-deadline" type="datetime-local" value={responseDeadline} onChange={(event) => setResponseDeadline(event.target.value)} />
                <p className="field-hint">未設定の場合は予定確定まで回答できます。</p>
                <button className="button button-lime button-full form-submit" type="submit" disabled={!selectedGroup || workspaceLoading}><Icon name="plus" /> 企画を作成する</button>
              </section>
              <aside className="create-aside">
                <div className="panel aside-panel"><span className="aside-icon"><Icon name="sparkles" /></span><h3>アイデアに迷ったら</h3><p>条件を入力して、遊びのアイデアを見つけよう。</p><button className="button button-outline button-full" type="button" onClick={() => navigate("ai")}>AIに相談する <Icon name="arrow" /></button></div>
                <div className="panel aside-panel"><span className="aside-icon aside-icon-purple"><Icon name="shuffle" /></span><h3>みんなで決めるのも楽しい</h3><p>遊びガチャを回して、次のきっかけに。</p><button className="button button-outline button-full" type="button" onClick={() => navigate("gacha")}>ガチャを回す <Icon name="arrow" /></button></div>
              </aside>
            </form>
          </>
        );

      case "activities":
        return (
          <>
            <button className="back-link" type="button" onClick={() => navigate("create")}><Icon name="chevron" /> 企画作成に戻る</button>
            <PageHeading eyebrow="PICK YOUR VIBE" title="どんな遊びにする？" description="ぴんときたジャンルを選ぼう。いくつ選んでもOK！" />
            <div className="activity-grid">
              {activityOptions.map((activity, index) => <button className={`activity-card activity-${activity.color} ${selectedActivities.includes(activity.name) ? "is-selected" : ""}`} type="button" key={activity.name} onClick={() => toggleActivity(activity.name)}><span className="activity-number">0{index + 1}</span><span className="activity-emoji">{activity.emoji}</span><strong>{activity.name}</strong><small>{activity.caption}</small><span className="activity-check">{selectedActivities.includes(activity.name) ? <Icon name="check" /> : <Icon name="plus" />}</span></button>)}
            </div>
            <div className="sticky-action"><span>{selectedActivities.length}個選択中</span><button className="button button-lime" type="button" onClick={() => navigate("create")}>この内容で企画に戻る <Icon name="chevron" /></button></div>
          </>
        );

      case "dates":
        return (
          <>
            <PageHeading
              eyebrow="FIND A DAY FOR EVERYONE"
              title="日程を決めよう"
              description="参加できる日を選んで、みんなの予定を集めよう。"
              action={
                <button
                  className="button button-lime"
                  type="button"
                  disabled={!datePlan || !canEditDateCandidates}
                  onClick={() => openCandidateEditor()}
                >
                  <Icon name="plus" /> 候補日時を追加
                </button>
              }
            />
            {plans.length > 0 && (
              <div className="date-plan-selector">
                <label className="field-label" htmlFor="date-plan-select">日程を調整する企画</label>
                <select
                  className="input-control"
                  id="date-plan-select"
                  value={datePlan?.id ?? ""}
                  onChange={(event) => {
                    const plan = plans.find((item) => item.id === event.target.value);
                    setSelectedPlanId(event.target.value);
                    if (plan) setSelectedGroupId(plan.group_id);
                  }}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {groups.find((group) => group.id === plan.group_id)?.name ?? "グループ"} · {plan.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!datePlan ? (
              <div className="panel empty-state">
                <span>▦</span>
                <strong>日程を調整する企画がありません</strong>
                <p>企画を作成すると、候補日時を登録できます。</p>
                <button className="button button-lime" type="button" onClick={() => navigate(selectedGroup ? "create" : "groups")}>
                  {selectedGroup ? "企画を作成" : "グループを作成"}
                </button>
              </div>
            ) : (
              <>
                {dateError && <div className="auth-error" role="alert">{dateError}</div>}
                {dateLoading && <div className="workspace-loading" role="status">日程情報を読み込んでいます…</div>}
                <div className="date-layout">
                  <section className="panel date-vote-panel">
                    <div className="plan-context">
                      <span className="plan-art art-sunset"><span>🍖</span></span>
                      <div>
                        <span className="tiny-tag tag-lime">{datePlanGroup?.name ?? "グループ"}</span>
                        <h2>{datePlan.title}</h2>
                        <p>
                          <Icon name="clock" />
                          回答締切：
                          {datePlan.response_deadline
                            ? new Date(datePlan.response_deadline).toLocaleString("ja-JP")
                            : "予定確定まで"}
                        </p>
                      </div>
                    </div>
                    <div className="divider" />
                    <div className="date-toolbar">
                      <div>
                        <h3>候補日時 <span className="count-pill">{dateCandidates.length}</span></h3>
                        <p>○の人数が多い順に表示しています。自分の回答を選んでください。</p>
                      </div>
                      <div className="date-toolbar-actions">
                        <button
                          className="text-action date-refresh-button"
                          type="button"
                          aria-label="日程情報を再読み込み"
                          disabled={dateLoading}
                          onClick={() => setDateRefreshVersion((current) => current + 1)}
                        >
                          更新
                        </button>
                        <span className={`live-status ${canRespondToDates ? "" : "is-closed"}`}>
                          <i />{datePlan.status === "confirmed" ? "予定確定済み" : dateDeadlinePassed ? "回答締切済み" : "回答受付中"}
                        </span>
                      </div>
                    </div>
                    {rankedDateCandidatesWithRank.length > 0 ? (
                      <div className="candidate-list">
                        {rankedDateCandidatesWithRank.map((candidate) => {
                          const display = getDateCandidateDisplay(candidate.starts_at, candidate.ends_at);
                          const currentResponse = candidate.responses.find(
                            (response) => response.user_id === user?.id,
                          )?.response;

                          return (
                            <article
                              className={`candidate-card ${candidate.id === focusedCandidate?.id ? "is-focused" : ""}`}
                              key={candidate.id}
                            >
                              <div className="candidate-heading">
                                <button
                                  className="candidate-date candidate-date-select"
                                  type="button"
                                  aria-pressed={candidate.id === focusedCandidate?.id}
                                  onClick={() => setSelectedCandidateId(candidate.id)}
                                >
                                  <strong>{display.date}</strong>
                                  <span>（{display.weekday}）</span>
                                  <small>{display.time}</small>
                                  <span className="candidate-rank">{candidate.rank}位</span>
                                </button>
                                {canEditDateCandidates && (
                                  <button
                                    className="icon-button candidate-edit"
                                    type="button"
                                    aria-label={`${display.date} ${display.time}の候補日時を編集`}
                                    onClick={() => openCandidateEditor(candidate)}
                                  >
                                    <Icon name="edit" />
                                  </button>
                                )}
                              </div>
                              <div className="candidate-votes" role="group" aria-label={`${display.date}の参加可否`}>
                                {dateResponseOptions.map((option) => {
                                  const count =
                                    option.value === "available"
                                      ? candidate.availableCount
                                      : option.value === "conditional"
                                        ? candidate.conditionalCount
                                        : candidate.unavailableCount;
                                  return (
                                    <button
                                      className={`vote-button ${option.className} ${currentResponse === option.value ? "is-selected" : ""}`}
                                      type="button"
                                      key={option.value}
                                      aria-pressed={currentResponse === option.value}
                                      disabled={!canRespondToDates || Boolean(savingVoteCandidateId)}
                                      onClick={() => void saveDateResponse(candidate.id, option.value)}
                                    >
                                      <strong>{option.symbol}</strong>
                                      <small>{count}人</small>
                                    </button>
                                  );
                                })}
                              </div>
                              <span className="candidate-response-count">
                                {candidate.responses.length}/{datePlanGroup?.members.length ?? 0}人回答
                              </span>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-state candidate-empty-state">
                        <strong>{dateLoading ? "候補日時を確認しています" : "候補日時はまだありません"}</strong>
                        {!dateLoading && canEditDateCandidates && <p>参加できそうな日時を追加してください。</p>}
                      </div>
                    )}
                    {canEditDateCandidates && (
                      <button className="add-date-inline" type="button" onClick={() => openCandidateEditor()}>
                        <Icon name="plus" /> 日程候補を追加
                      </button>
                    )}
                    {!canEditDateCandidates && datePlan.status === "confirmed" && (
                      <p className="fine-print">予定確定後の日程候補は企画作成者のみ編集できます。</p>
                    )}
                    <div className="vote-legend">
                      <span><i className="legend-yes" />参加できる</span>
                      <span><i className="legend-maybe" />条件次第</span>
                      <span><i className="legend-no" />参加できない</span>
                    </div>
                  </section>
                  <aside className="panel date-summary-panel">
                    <SectionHeading
                      title="メンバーの回答状況"
                      action={
                        <span className="tiny-tag tag-lime">
                          {focusedCandidate?.responses.length ?? 0} / {datePlanGroup?.members.length ?? 0} 回答
                        </span>
                      }
                    />
                    {focusedCandidate ? (
                      <>
                        <p className="focused-date-label">
                          {getDateCandidateDisplay(focusedCandidate.starts_at, focusedCandidate.ends_at).date}
                          {" "}({getDateCandidateDisplay(focusedCandidate.starts_at, focusedCandidate.ends_at).weekday})
                          {" "}{getDateCandidateDisplay(focusedCandidate.starts_at, focusedCandidate.ends_at).time}
                        </p>
                        <div className="response-summary">
                          <span><i className="legend-yes" />○ {focusedCandidate.availableCount}</span>
                          <span><i className="legend-maybe" />△ {focusedCandidate.conditionalCount}</span>
                          <span><i className="legend-no" />× {focusedCandidate.unavailableCount}</span>
                          <span><i className="legend-pending" />未回答 {Math.max((datePlanGroup?.members.length ?? 0) - focusedCandidate.responses.length, 0)}</span>
                        </div>
                        <div className="member-response-list">
                          {datePlanGroup?.members.map((member, index) => {
                            const response = focusedResponseByUser.get(member.userId);
                            const option = dateResponseOptions.find((item) => item.value === response);
                            return (
                              <div className="member-response-row" key={member.userId}>
                                <Avatar
                                  initials={member.nickname.slice(0, 1)}
                                  color={members[index % members.length].color}
                                  size="small"
                                />
                                <strong>{member.nickname}</strong>
                                <span className={response ? `response-status response-${response}` : "response-pending"}>
                                  {response && option ? `${option.symbol} ${option.label}` : "未回答"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="panel-subtitle">候補日時を登録すると回答状況が表示されます。</p>
                    )}
                    {rankedDateCandidatesWithRank[0] && (
                      <div className="best-date-card">
                        <span className="best-date-icon"><Icon name="star" /></span>
                        <div>
                          <small>おすすめ {rankedDateCandidatesWithRank[0].rank}位</small>
                          <strong>
                            {getDateCandidateDisplay(
                              rankedDateCandidatesWithRank[0].starts_at,
                              rankedDateCandidatesWithRank[0].ends_at,
                            ).date}
                            {" "}({getDateCandidateDisplay(
                              rankedDateCandidatesWithRank[0].starts_at,
                              rankedDateCandidatesWithRank[0].ends_at,
                            ).weekday})
                            {" "}{getDateCandidateDisplay(
                              rankedDateCandidatesWithRank[0].starts_at,
                              rankedDateCandidatesWithRank[0].ends_at,
                            ).time}
                          </strong>
                          <span>
                            参加可能 {rankedDateCandidatesWithRank[0].availableCount}人 ·
                            条件次第 {rankedDateCandidatesWithRank[0].conditionalCount}人
                          </span>
                        </div>
                      </div>
                    )}
                    <p className="fine-print">○の人数が同じ候補は同じ順位で表示します。</p>
                  </aside>
                </div>
              </>
            )}
          </>
        );

      case "places":
        return (
          <>
            <PageHeading eyebrow="FIND YOUR NEXT SPOT" title="場所を検索" description="Google Mapsから場所を検索し、グループのお気に入りに登録できます。" />
            <form className="search-panel panel places-search-form" onSubmit={(event) => void searchPlaces(event)}>
              <div className="places-search-row">
                <label className="search-input-wrap" htmlFor="place-search">
                  <Icon name="search" />
                  <input
                    id="place-search"
                    placeholder="キーワードで検索（例：カフェ、BBQ、駐車場）"
                    value={query}
                    maxLength={120}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      resetPlaceSearch();
                    }}
                  />
                </label>
                <button
                  className="button button-lime places-search-button"
                  type="submit"
                  disabled={placeSearchLoading || !selectedGroupId}
                >
                  <Icon name="search" /> {placeSearchLoading ? "検索中…" : "検索"}
                </button>
              </div>
              <div className="places-search-options">
                <label className="places-select-label" htmlFor="place-category">
                  <span>検索対象</span>
                  <select
                    id="place-category"
                    value={placeCategory}
                    onChange={(event) => {
                      const selectedCategory = event.target.value;
                      if (selectedCategory === "shops_and_food" || selectedCategory === "parking") {
                        setPlaceCategory(selectedCategory);
                      }
                      resetPlaceSearch();
                    }}
                  >
                    <option value="shops_and_food">お店・飲食店・カフェ</option>
                    <option value="parking">駐車場</option>
                  </select>
                </label>
                <label className="places-select-label" htmlFor="place-radius">
                  <span>検索半径</span>
                  <select
                    id="place-radius"
                    value={placeRadiusKm}
                    onChange={(event) => {
                      setPlaceRadiusKm(Number(event.target.value));
                      resetPlaceSearch();
                    }}
                  >
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={20}>20 km</option>
                    <option value={50}>50 km</option>
                  </select>
                </label>
              </div>
              <fieldset className="places-location-options">
                <legend>検索地域</legend>
                <label>
                  <input
                    type="radio"
                    name="place-location-mode"
                    value="area"
                    checked={placeLocationMode === "area"}
                    onChange={() => {
                      setPlaceLocationMode("area");
                      resetPlaceSearch();
                    }}
                  />
                  地域を入力
                </label>
                <label>
                  <input
                    type="radio"
                    name="place-location-mode"
                    value="current"
                    checked={placeLocationMode === "current"}
                    onChange={() => {
                      setPlaceLocationMode("current");
                      resetPlaceSearch();
                    }}
                  />
                  現在地を使う
                </label>
              </fieldset>
              {placeLocationMode === "area" ? (
                <label className="places-area-label" htmlFor="place-area">
                  <span>地域名</span>
                  <input
                    id="place-area"
                    value={placeArea}
                    maxLength={120}
                    placeholder="例：東京都渋谷区"
                    onChange={(event) => {
                      setPlaceArea(event.target.value);
                      resetPlaceSearch();
                    }}
                  />
                </label>
              ) : (
                <p className="places-location-note">
                  検索時にブラウザーが位置情報の許可を確認します。位置情報は検索にのみ使用し、保存しません。
                </p>
              )}
              <p className="place-search-note">
                距離は検索地域からの直線距離です。お店・飲食店・カフェは最大3回、駐車場は1回Places APIを呼び出します。地域入力時はGeocoding APIも1回使います。無料枠を超えると料金が発生する場合があります。
              </p>
            </form>
            {!selectedGroupId && (
              <p className="place-error" role="status">場所検索とお気に入りには、参加中のグループが必要です。</p>
            )}
            {placeSearchError && <p className="place-error" role="alert">{placeSearchError}</p>}
            <div className="places-layout">
              <section className="results-column place-results-column">
                <SectionHeading
                  title="検索結果"
                  action={<span className="count-pill">{placeResults.length}件</span>}
                />
                <div className="place-list">
                  {placeResults.map((place) => {
                    const favorite = favoriteGroupId === selectedGroupId
                      ? favoritePlaces.find((item) => item.providerPlaceId === place.id)
                      : undefined;
                    const canToggleFavorite = Boolean(
                      selectedGroupId &&
                      user &&
                      favoriteGroupId === selectedGroupId &&
                      (!favorite ||
                        favorite.addedBy === user.id ||
                        groups.find((group) => group.id === favorite.groupId)?.role === "admin"),
                    );
                    return (
                      <PlaceCard
                        key={place.id}
                        name={place.name}
                        address={place.address ?? "住所情報はありません。"}
                        distanceMeters={place.distanceMeters}
                        favorite={Boolean(favorite)}
                        canToggleFavorite={canToggleFavorite}
                        onFavorite={() => void toggleFavorite(place)}
                        mapAction={() => setSelectedSearchMapPlace({
                          id: place.id,
                          name: place.name,
                          address: place.address,
                        })}
                      />
                    );
                  })}
                  {!placeSearchLoading && !placeSearchError && placeResults.length === 0 && (
                    <div className="empty-state">
                      <span>⌕</span>
                      <strong>{hasSearchedPlaces ? "場所が見つかりません" : "検索条件を入力してください"}</strong>
                      <p>{hasSearchedPlaces ? "別のキーワードでもう一度検索してください。" : "検索はボタンを押したときだけ実行されます。"}</p>
                    </div>
                  )}
                </div>
                {placeResults.length > 0 && (
                  <p className="google-maps-attribution" translate="no">Google Maps</p>
                )}
              </section>
              <PlaceMapPanel place={selectedSearchMapPlace} />
            </div>
          </>
        );

      case "favorites":
        return (
          <>
            <PageHeading
              eyebrow="SAVED TOGETHER"
              title="お気に入り"
              description="場所の詳細情報は保存せず、必要なときにGoogle Mapsから取得します。"
              action={<button className="button button-lime" type="button" onClick={() => navigate("places")}><Icon name="search" /> 場所を探す</button>}
            />
            <div className="favorites-toolbar">
              <span>{selectedGroup?.name ?? "グループ未選択"}</span>
              {groups.length > 1 && (
                <select
                  className="input-control group-select"
                  aria-label="お気に入りを表示するグループ"
                  value={selectedGroupId}
                  onChange={(event) => {
                    setSelectedFavoriteMapPlace(null);
                    setSelectedGroupId(event.target.value);
                  }}
                >
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              )}
            </div>
            <div className="favorite-hero panel">
              <span className="favorite-hero-icon"><Icon name="heart" /></span>
              <div>
                <span className="eyebrow">GROUP COLLECTION</span>
                <h2>{favoritePlaces.length}スポット</h2>
                <p>グループで共有しているお気に入りです。</p>
              </div>
            </div>
            {favoriteError?.groupId === selectedGroupId && (
              <p className="place-error" role="alert">{favoriteError.message}</p>
            )}
            {!selectedGroupId ? (
              <div className="empty-state">
                <strong>グループを選択してください</strong>
                <p>参加中のグループのお気に入りを表示します。</p>
                <button className="button button-lime" type="button" onClick={() => navigate("groups")}>グループを見る</button>
              </div>
            ) : favoriteGroupId !== selectedGroupId &&
              favoriteError?.groupId !== selectedGroupId ? (
              <div className="empty-state"><strong>お気に入りを読み込んでいます…</strong></div>
            ) : favoriteError?.groupId === selectedGroupId ? null : (
              <div className="place-grid">
                {favoritePlaces.map((favorite) => {
                  const details = placeDetails[favorite.providerPlaceId];
                  const canRemove =
                    favorite.addedBy === user?.id || selectedGroup?.role === "admin";
                  return (
                    <PlaceCard
                      key={favorite.placeId}
                      name={details?.name ?? "場所情報は未取得です"}
                      address={
                        details
                          ? details.address ?? "住所情報はありません。"
                          : "詳細を表示するにはPlaces APIを呼び出します。"
                      }
                      favorite
                      canToggleFavorite={canRemove}
                      onFavorite={() => void toggleFavorite({
                        id: favorite.providerPlaceId,
                        name: details?.name ?? "",
                        address: details?.address ?? "",
                      })}
                      mapAction={() => setSelectedFavoriteMapPlace({
                        id: favorite.providerPlaceId,
                        name: details?.name ?? "お気に入りの場所",
                        address: details?.address,
                        groupId: favorite.groupId,
                      })}
                      detailAction={!details ? {
                        label: "場所情報を取得（API呼び出し）",
                        loading: favoriteDetailLoadingIds.includes(favorite.placeId),
                        onClick: () => void loadFavoriteDetails(favorite),
                      } : undefined}
                    />
                  );
                })}
                {favoritePlaces.length === 0 && (
                  <div className="empty-state">
                    <span>♡</span>
                    <strong>お気に入りはまだありません</strong>
                    <p>検索結果から気になる場所を登録してください。</p>
                    <button className="button button-lime" type="button" onClick={() => navigate("places")}>場所を探す</button>
                  </div>
                )}
              </div>
            )}
            {selectedFavoriteMapPlace &&
              selectedFavoriteMapPlace.groupId === selectedGroupId &&
              favoritePlaces.some((favorite) =>
                favorite.providerPlaceId === selectedFavoriteMapPlace.id,
              ) && <PlaceMapPanel place={selectedFavoriteMapPlace} />}
            {favoritePlaces.some((favorite) => placeDetails[favorite.providerPlaceId]) && (
              <p className="google-maps-attribution" translate="no">Google Maps</p>
            )}
          </>
        );

      case "ai":
        return (
          <>
            <PageHeading eyebrow="IDEAS FOR YOUR CREW" title="遊びのアイデアを見つけよう" description="条件を入れると、みんなにぴったりな遊び方を提案します。" />
            <div className="ai-layout">
              <section className="panel ai-form-panel">
                <div className="ai-badge"><Icon name="sparkles" /> AWASO IDEA LAB</div>
                <h2>どんな一日にしたい？</h2>
                <p>ざっくりした希望だけで大丈夫。</p>
                <label className="field-label" htmlFor="ai-budget">1人あたり予算上限（交通費別）</label>
                <select
                  id="ai-budget"
                  className="input-control"
                  value={aiBudget}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "3000" ||
                      value === "5000" ||
                      value === "10000" ||
                      value === "any"
                    ) {
                      resetAiSuggestions();
                      setAiBudget(value);
                    }
                  }}
                >
                  <option value="3000">3,000円以下</option>
                  <option value="5000">5,000円以下</option>
                  <option value="10000">10,000円以下</option>
                  <option value="any">特に決めていない</option>
                </select>
                <label className="field-label" htmlFor="ai-area">行きたいエリア（任意）</label>
                <div className="input-with-icon">
                  <Icon name="pin" />
                  <input
                    className="input-control"
                    id="ai-area"
                    placeholder="例）沖縄県 那覇市"
                    value={aiArea}
                    onChange={(event) => {
                      resetAiSuggestions();
                      setAiArea(event.target.value);
                    }}
                  />
                </div>
                <label className="field-label" htmlFor="ai-people">参加人数</label>
                <select
                  id="ai-people"
                  className="input-control"
                  value={aiParticipantCount}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "2") {
                      resetAiSuggestions();
                      setAiParticipantCount(2);
                    } else if (value === "3") {
                      resetAiSuggestions();
                      setAiParticipantCount(3);
                    } else if (value === "4") {
                      resetAiSuggestions();
                      setAiParticipantCount(4);
                    } else if (value === "5+") {
                      resetAiSuggestions();
                      setAiParticipantCount("5+");
                    }
                  }}
                >
                  <option value="2">2人</option>
                  <option value="3">3人</option>
                  <option value="4">4人</option>
                  <option value="5+">5人以上</option>
                </select>
                <span className="field-label">興味のあること</span>
                <div className="interest-chips">
                  {ACTIVITY_INTERESTS.map((interest) => (
                    <button
                      className={`filter-chip ${aiInterests.includes(interest) ? "is-active" : ""}`}
                      key={interest}
                      type="button"
                      aria-pressed={aiInterests.includes(interest)}
                      onClick={() => toggleAiInterest(interest)}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
                <button
                  className="button button-lime button-full"
                  type="button"
                  onClick={() => showAiSuggestion()}
                >
                  <Icon name="sparkles" /> アイデアを見てみる
                </button>
                <p className="ai-note">
                  <Icon name="check" /> 提案はアプリ内のテンプレートから選び、入力内容は外部サービスへ送信しません。
                </p>
              </section>
              <section className="ai-results" aria-live="polite">
                {!aiHasGenerated ? (
                  <div className="ai-empty panel"><div className="ai-orbit"><Icon name="sparkles" /></div><span className="eyebrow">YOUR NEXT GOOD DAY</span><h2>アイデアは、ここに。</h2><p>条件を入れて「アイデアを見てみる」を押してね。</p><div className="ai-empty-stars">✦　·　✧　·　✦</div></div>
                ) : matchingAiTemplates.length === 0 ? (
                  <div className="ai-empty panel">
                    <div className="ai-orbit"><Icon name="sparkles" /></div>
                    <span className="eyebrow">NO MATCHING IDEAS</span>
                    <h2>条件に合うアイデアがありません</h2>
                    <p>予算・参加人数・興味を変更して、もう一度お試しください。</p>
                  </div>
                ) : currentAiTemplate && currentAiPresentation ? (
                  <>
                    <div className="results-intro">
                      <span className="tiny-tag tag-purple">
                        IDEA {String(aiShownSuggestionIds.length).padStart(2, "0")}
                      </span>
                      <h2>あなたへのアイデア</h2>
                      <p>条件に合うテンプレートから選びました。</p>
                    </div>
                    <article className="suggestion-card panel">
                      <div className={`suggestion-art ${currentAiPresentation.artClass}`}>
                        <span>{currentAiPresentation.emoji}</span>
                        <span className="suggestion-stamp">
                          {currentAiTemplate.maxParticipants === null
                            ? "5人以上にも対応"
                            : `${currentAiTemplate.minParticipants}〜${currentAiTemplate.maxParticipants}人向け`}
                        </span>
                      </div>
                      <div className="suggestion-copy">
                        <div className="tag-row">
                          {currentAiTemplate.interestTags.map((interest) => (
                            <span className="tiny-tag" key={interest}>{interest}</span>
                          ))}
                        </div>
                        <h3>{currentAiTemplate.title}</h3>
                        <p>{currentAiTemplate.description}</p>
                        <div className="suggestion-meta">
                          <span>
                            目安 {currentAiTemplate.estimatedCostMinYen.toLocaleString("ja-JP")}〜
                            {currentAiTemplate.estimatedCostMaxYen.toLocaleString("ja-JP")}円 / 人
                          </span>
                          <span>
                            約{currentAiTemplate.durationMinMinutes / 60}〜
                            {currentAiTemplate.durationMaxMinutes / 60}時間
                          </span>
                        </div>
                        <button
                          className="button button-lime button-full"
                          type="button"
                          onClick={() => {
                            setPlanTitle(currentAiTemplate.title);
                            setPlanDescription(currentAiTemplate.description);
                            navigate("create");
                          }}
                        >
                          このアイデアで企画を作る <Icon name="arrow" />
                        </button>
                        {aiArea.trim() && (
                          <button
                            className="button button-outline button-full"
                            type="button"
                            onClick={openPlacesFromAi}
                          >
                            場所を探す <Icon name="map" />
                          </button>
                        )}
                      </div>
                    </article>
                    <button
                      className="button button-outline button-full"
                      type="button"
                      disabled={unseenAiTemplates.length === 0}
                      onClick={() => showAiSuggestion(true)}
                    >
                      別のアイデアを見る <Icon name="shuffle" />
                    </button>
                    {unseenAiTemplates.length === 0 && (
                      <p className="prototype-note">
                        <Icon name="sun" />
                        <span>この条件に合う別の案はありません。条件を変更してください。</span>
                      </p>
                    )}
                  </>
                ) : (
                  <div className="ai-empty panel">
                    <div className="ai-orbit"><Icon name="sparkles" /></div>
                    <h2>アイデアを表示できませんでした</h2>
                    <p>もう一度「アイデアを見てみる」を押してください。</p>
                  </div>
                )}
              </section>
            </div>
            <div className="prototype-note">
              <Icon name="sun" />
              <span>
                <strong>費用・時間は目安です。</strong>
                実際の料金や施設の定員は利用先にご確認ください。交通費は含みません。
              </span>
            </div>
          </>
        );

      case "gacha":
        return (
          <>
            <PageHeading eyebrow="LET THE GOOD TIMES ROLL" title="遊びガチャ" description="何をするか迷ったら、運にまかせてみよう。" />
            <section className="gacha-stage panel">
              <div className="gacha-star star-a">✦</div><div className="gacha-star star-b">✧</div><div className="gacha-star star-c">✦</div>
              <div className="gacha-orbit"><span className="gacha-orbit-dot" /><span className="gacha-orbit-dot" /></div>
              <div className="gacha-ticket"><span className="gacha-ticket-top">TODAY&apos;S PLAY</span><span className="gacha-ticket-emoji">{gachaResult === "BBQ" ? "🍖" : gachaResult === "映画" ? "🎬" : gachaResult === "カフェ" ? "☕" : "🎳"}</span><strong>{gachaResult}</strong><small>のんびり？わいわい？次の予定のヒントに。</small></div>
              <span className="tiny-tag tag-lime">あわそグループ · 4人</span>
              <button className="button button-lime gacha-button" type="button" onClick={() => { const options = ["ボウリング", "BBQ", "映画", "カフェ"]; const next = options[Math.floor(Math.random() * options.length)]; setGachaResult(next); showToast("新しい遊びを引きました"); }}><Icon name="shuffle" /> もう一回まわす</button>
              <button className="button button-outline" type="button" onClick={() => { setPlanTitle(`${gachaResult}に行こう！`); navigate("create"); }}>この遊びで企画をつくる <Icon name="arrow" /></button>
            </section>
            <div className="gacha-footnote"><Icon name="sparkles" /><span>候補は画面デモ用です。採用した候補だけ企画に保存できます。</span></div>
          </>
        );

      case "preferences":
        return (
          <>
            <PageHeading eyebrow="A LITTLE BIT OF EVERYONE" title="グループの好み" description="みんなの「好き」をヒントに、次の候補を見つけよう。" />
            <section className="panel preference-hero"><div className="preference-visual"><span>✦</span><strong>GOOD<br />VIBES</strong><i>◌</i></div><div className="preference-copy"><span className="tiny-tag tag-purple">GROUP LEARNING</span><h2>みんなの「好き」を、次の遊びに。</h2><p>全員が同意したグループだけで、企画の採用・見送り結果をもとに候補を調整します。閲覧やクリックは使いません。</p><div className="consent-status"><span className={`status-dot ${consentedMembers.length === 4 ? "status-dot-lime" : "status-dot-purple"}`} /> {consentedMembers.length} / 4人が同意　·　{consentedMembers.length === 4 ? "学習が有効です" : "全員の同意が必要です"}</div></div></section>
            <div className="two-column-grid">
              <section className="panel"><SectionHeading title="メンバーの同意" /><p className="panel-subtitle">同意はいつでも変更できます。新しいメンバーが参加すると、全員同意がそろうまで停止します。</p><div className="member-consent-list">{members.map((member) => { const consented = consentedMembers.includes(member.name); return <div className="consent-row" key={member.name}><Avatar initials={member.initials} color={member.color} size="small" /><strong>{member.name}</strong><span className={consented ? "consent-label is-on" : "consent-label"}>{consented ? "同意済み" : "未同意"}</span><button className={`switch ${consented ? "is-on" : ""}`} type="button" role="switch" aria-checked={consented} aria-label={`${member.name}の同意状態を切り替え`} onClick={() => setConsentedMembers((current) => consented ? current.filter((name) => name !== member.name) : [...current, member.name])}><span /></button></div>; })}</div></section>
              <section className="panel"><SectionHeading title="最近のグループ傾向" action={<span className="tiny-tag tag-cyan">プレビュー</span>} /><div className="preference-bars">{[["カフェ・ごはん", 78], ["自然・おでかけ", 61], ["体験・アクティブ", 42], ["映画・のんびり", 28]].map(([label, percent]) => <div className="preference-bar-row" key={label as string}><div><span>{label}</span><strong>{percent}%</strong></div><span className="bar-track"><i style={{ width: `${percent}%` }} /></span></div>)}</div><p className="fine-print">企画での明示的な採用・見送りだけを集計します。</p></section>
            </div>
            <div className="prototype-note"><Icon name="check" /><span>グループの好み学習は全員同意が必須です。集計データは保存せず、他グループや外部AIへ共有しません。</span></div>
          </>
        );

      case "memories":
        return (
          <>
            <PageHeading eyebrow="LITTLE MOMENTS, BIG MEMORIES" title="思い出アルバム" description="みんなで過ごした時間を、企画ごとに残そう。" action={<label className="button button-lime upload-button"><Icon name="camera" /> 写真を追加<input type="file" accept="image/*" onChange={(event) => setUploadedName(event.target.files?.[0]?.name ?? "")} /></label>} />
            <div className="memory-feature panel"><div className="memory-feature-art art-sunset"><span>🌇</span><i>✦</i><b>SUMMER<br />TOGETHER</b></div><div className="memory-feature-copy"><span className="tiny-tag tag-lime">最近の企画</span><h2>海辺で過ごした夏の日</h2><p><Icon name="calendar" /> 2026年8月16日　·　<Icon name="user" /> 4人</p><p className="memory-caption">「夕焼けがすごくきれいだった！また行こうね」</p><button className="text-action" type="button" onClick={() => showToast("アルバムの詳細を開きました")}>アルバムを見る <Icon name="chevron" /></button></div></div>
            {uploadedName && <div className="upload-feedback"><Icon name="check" />「{uploadedName}」を追加しました（この画面内のプレビューです）</div>}
            <SectionHeading title="アルバム" action={<div className="filter-chip-row"><button className="filter-chip is-active" type="button">すべて</button><button className="filter-chip" type="button">あわそグループ <Icon name="chevron" /></button></div>} />
            <div className="memory-grid">
              {[
                { title: "週末バーベキュー", date: "2026年7月12日", emoji: "🍖", art: "art-sunset", count: "写真 8枚" },
                { title: "海辺ドライブ", date: "2026年6月21日", emoji: "🌊", art: "art-ocean", count: "写真 12枚" },
                { title: "ボウリング大会", date: "2026年5月17日", emoji: "🎳", art: "art-purple", count: "写真 5枚" },
                { title: "カフェでおしゃべり", date: "2026年4月04日", emoji: "☕", art: "art-cafe", count: "写真 3枚" },
              ].map((memory) => <button className="memory-card" type="button" key={memory.title} onClick={() => showToast(`${memory.title}のアルバムを開きました`)}><div className={`memory-cover ${memory.art}`}><span>{memory.emoji}</span><small><Icon name="image" /> {memory.count}</small></div><strong>{memory.title}</strong><span>{memory.date}</span></button>)}
            </div>
            <p className="fine-print memory-privacy"><Icon name="user" /> アルバムはグループメンバーだけが閲覧できます。</p>
          </>
        );

      case "notifications":
        return (
          <>
            <PageHeading eyebrow="YOUR GROUP UPDATES" title="お知らせ" description="参加申請と承認結果を確認できます。" action={<button className="text-action" type="button" onClick={markAllNotificationsRead} disabled={notifications.every((notice) => notice.readAt)}>すべて既読にする</button>} />
            <section className="panel notification-panel">
              {notifications.length > 0 ? notifications.map((notice) => <article className={`notification-item ${notice.readAt ? "is-read" : ""}`} key={notice.id}><span className={`notification-icon ${notice.eventType === "join_request_received" ? "notice-purple" : "notice-lime"}`}><Icon name={notice.eventType === "join_request_received" ? "groups" : "check"} /></span><div className="notification-copy"><div className="notification-heading"><h3>{notice.title}</h3>{!notice.readAt && <span className="unread-dot" />}</div><p>{notice.body}</p><span className="notification-time">{new Date(notice.createdAt).toLocaleString("ja-JP")}</span><button className="text-action" type="button" onClick={() => openNotification(notice)}>確認する <Icon name="chevron" /></button></div>{!notice.readAt && <button className="icon-button notification-read-button" type="button" aria-label="既読にする" onClick={() => void markNotificationRead(notice.id)}><Icon name="check" /></button>}</article>) : <div className="empty-state"><span>♧</span><strong>お知らせはありません</strong><p>参加申請や承認結果がここに表示されます。</p></div>}
            </section>
            <div className="notification-settings-link"><span><Icon name="settings" /> Web Push通知は未設定です</span><button className="text-action" type="button" onClick={() => showToast("Web Push通知は今後対応予定です")}>詳細 <Icon name="chevron" /></button></div>
          </>
        );

      case "settings":
        return (
          <>
            <PageHeading eyebrow="YOUR ACCOUNT" title="プロフィール・設定" description="あわその使い方を自分好みに整えよう。" />
            <div className="settings-layout">
              <section className="panel settings-profile"><SectionHeading title="プロフィール" /><div className="profile-summary"><Avatar initials={nickname.slice(0, 1) || "あ"} color="avatar-lime" size="large" /><div><strong>{nickname || "読み込み中"}</strong><span>{user?.email ?? "Googleアカウントでログイン中"}</span></div></div><form onSubmit={saveNickname}><label className="field-label" htmlFor="nickname">ニックネーム</label><input className="input-control" id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required /><button className="button button-lime settings-save" type="submit">変更を保存</button></form></section>
              <section className="panel settings-section"><SectionHeading title="通知設定" /><p className="panel-subtitle">受け取りたいお知らせを選べます。</p>{["参加申請・承認", "企画の変更", "予定のリマインド"].map((item) => { const enabled = notificationToggles[item]; return <div className="setting-row" key={item}><span><strong>{item}</strong><small>{item === "予定のリマインド" ? "予定前にお知らせ" : "アプリ内通知とWeb Push"}</small></span><button className={`switch ${enabled ? "is-on" : ""}`} type="button" role="switch" aria-checked={enabled} aria-label={`${item}通知を切り替え`} onClick={() => setNotificationToggles((current) => ({ ...current, [item]: !current[item] }))}><span /></button></div>; })}</section>
              <section className="panel settings-section"><SectionHeading title="プライバシー" /><button className="settings-link-row" type="button" onClick={() => navigate("preferences")}><span className="settings-link-icon"><Icon name="chart" /></span><span><strong>グループの好み学習</strong><small>同意状況と利用について確認</small></span><Icon name="chevron" /></button><button className="settings-link-row" type="button" onClick={() => showToast("年齢情報は取得・保存していません")}><span className="settings-link-icon"><Icon name="check" /></span><span><strong>データの取り扱い</strong><small>必要最小限の情報だけを使用</small></span><Icon name="chevron" /></button></section>
              <section className="panel settings-section danger-zone"><SectionHeading title="アカウント" /><p>アカウントを削除すると、本人のプロフィールや作成した企画などが削除されます。</p><button className="button button-danger-outline" type="button" onClick={() => setDeleteModalOpen(true)}>アカウントを削除する</button></section>
            </div>
          </>
        );
    }
  })();

  if (authLoading) {
    return <main className="auth-screen"><div className="workspace-loading" role="status">ログイン状態を確認しています…</div></main>;
  }

  if (!user) {
    return (
      <AuthScreen
        configured={Boolean(supabase)}
        loading={false}
        error={authError}
        invitationToken={invitationToken}
        invitationPreview={invitationPreview}
        invitationLoading={invitationLoading}
        invitationError={invitationError}
        onGoogleSignIn={handleGoogleSignIn}
      />
    );
  }

  if (needsNickname) {
    return (
      <main className="auth-screen">
        <form className="auth-panel panel" onSubmit={saveNickname}>
          <BrandMark />
          <span className="eyebrow">PROFILE SETUP</span>
          <h1>ニックネームを<br />設定してください。</h1>
          <p>グループ内で表示する名前です。Googleアカウント名は自動登録しません。</p>
          {invitationPreview && <div className="invite-preview-card"><small>参加するグループ</small><strong>{invitationPreview.groupName}</strong></div>}
          {workspaceError && <div className="auth-error" role="alert">{workspaceError}</div>}
          <label className="field-label" htmlFor="first-nickname">ニックネーム</label>
          <input className="input-control" id="first-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} autoComplete="nickname" required />
          <button className="button button-lime button-full auth-submit" type="submit" disabled={workspaceLoading}>保存して続ける</button>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-button" type="button" onClick={() => navigate("home")} aria-label="あわそ ホーム"><BrandMark /></button>
        <div className="sidebar-group">
          <span className="sidebar-label">MENU</span>
          {primaryNavigation.map((item) => <button className={`sidebar-link ${screen === item.id ? "is-active" : ""}`} key={item.id} type="button" onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "dates" && <span className="nav-count">3</span>}</button>)}
        </div>
        <div className="sidebar-group">
          <span className="sidebar-label">DISCOVER</span>
          {discoveryNavigation.map((item) => <button className={`sidebar-link ${screen === item.id ? "is-active" : ""}`} key={item.id} type="button" onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "ai" && <span className="new-pill">NEW</span>}</button>)}
        </div>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><span className="tip-glow">✦</span><p>今日の遊び、<br /><strong>ガチャで決める？</strong></p><button type="button" onClick={() => navigate("gacha")}>回してみる <Icon name="arrow" /></button></div>
        <button className="sidebar-profile" type="button" onClick={() => navigate("settings")}><Avatar initials={nickname.slice(0, 1) || "あ"} color="avatar-lime" size="small" /><span><strong>{nickname || "読み込み中"}</strong><small>プロフィール</small></span><Icon name="chevron" /></button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="メニューを開く"><Icon name={mobileMenuOpen ? "close" : "menu"} /></button>
          <div className="breadcrumb"><span>AWASO</span><Icon name="chevron" /><strong>{screenTitles[screen]}</strong></div>
          <div className="topbar-actions"><button className="topbar-search" type="button" onClick={() => navigate("places")}><Icon name="search" /><span>場所や企画を検索</span><kbd>⌘ K</kbd></button><button className="icon-button topbar-bell" type="button" onClick={() => navigate("notifications")} aria-label={unreadNotifications > 0 ? `未読のお知らせ${unreadNotifications}件` : "お知らせ"}><Icon name="bell" />{unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications}</span>}</button><button className="topbar-user" type="button" onClick={() => navigate("settings")}><Avatar initials={nickname.slice(0, 1) || "あ"} color="avatar-lime" size="small" /><span>{nickname || "プロフィール"}</span><Icon name="chevron" /></button><button className="button button-outline button-small signout-button" type="button" onClick={handleSignOut}>ログアウト</button></div>
        </header>
        {mobileMenuOpen && <div className="mobile-menu-panel">{[...primaryNavigation, ...discoveryNavigation].map((item) => <button className={screen === item.id ? "is-active" : ""} key={item.id} type="button" onClick={() => navigate(item.id)}><Icon name={item.icon} />{item.label}</button>)}</div>}
        <main className="main-content">
          {workspaceError && <div className="workspace-error" role="alert">{workspaceError}</div>}
          {workspaceLoading && <div className="workspace-loading" role="status">Supabaseからデータを読み込んでいます…</div>}
          {pageContent}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="メインメニュー">
        {[primaryNavigation[0], primaryNavigation[1], primaryNavigation[2], primaryNavigation[4], discoveryNavigation[5]].map((item) => <button className={screen === item.id ? "is-active" : ""} key={item.id} type="button" onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label === "行き先を探す" ? "探す" : item.label === "企画一覧" ? "企画" : item.label === "プロフィール・設定" ? "設定" : item.label}</span></button>)}
        <button className={mobileMenuOpen ? "is-active" : ""} type="button" onClick={() => setMobileMenuOpen((open) => !open)}><Icon name="menu" /><span>その他</span></button>
      </nav>

      {dateModalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setDateModalOpen(false)}
        >
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="date-modal-title">
            <button
              className="modal-close icon-button"
              type="button"
              aria-label="閉じる"
              onClick={() => setDateModalOpen(false)}
            >
              <Icon name="close" />
            </button>
            <span className="eyebrow">{editingCandidateId ? "EDIT A DATE" : "ADD A DATE"}</span>
            <h2 id="date-modal-title">{editingCandidateId ? "候補日時を編集" : "候補日時を追加"}</h2>
            <p>みんなが参加できそうな日を設定してください。</p>
            <form onSubmit={saveCandidate}>
              <label className="field-label" htmlFor="candidate-date">日にち</label>
              <input
                className="input-control"
                id="candidate-date"
                type="date"
                value={candidateDate}
                min={minimumCandidateDate}
                onChange={(event) => setCandidateDate(event.target.value)}
                required
              />
              <div className="field-grid">
                <div>
                  <label className="field-label" htmlFor="candidate-start">開始時刻</label>
                  <input
                    className="input-control"
                    id="candidate-start"
                    type="time"
                    value={candidateStart}
                    onChange={(event) => setCandidateStart(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="candidate-end">終了時刻</label>
                  <input
                    className="input-control"
                    id="candidate-end"
                    type="time"
                    value={candidateEnd}
                    onChange={(event) => setCandidateEnd(event.target.value)}
                    required
                  />
                </div>
              </div>
              <button
                className="button button-lime button-full"
                type="submit"
                disabled={savingCandidate}
              >
                <Icon name={editingCandidateId ? "edit" : "plus"} />
                {savingCandidate ? "保存中…" : editingCandidateId ? "候補を更新" : "候補を追加"}
              </button>
            </form>
          </section>
        </div>
      )}

      {deleteModalOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDeleteModalOpen(false)}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title"><button className="modal-close icon-button" type="button" aria-label="閉じる" onClick={() => setDeleteModalOpen(false)}><Icon name="close" /></button><span className="delete-modal-icon">!</span><h2 id="delete-modal-title">アカウントを削除しますか？</h2><p>本人が作成した企画や投稿した写真などが削除されます。このプレビューでは削除処理は実行されません。</p><div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setDeleteModalOpen(false)}>キャンセル</button><button className="button button-danger" type="button" onClick={() => { setDeleteModalOpen(false); showToast("アカウント削除はバックエンド未接続です"); }}>削除の流れを確認</button></div></section></div>}

      {toast && <div className="toast-message" role="status"><Icon name="check" />{toast}<button type="button" onClick={() => setToast("")} aria-label="閉じる"><Icon name="close" /></button></div>}
      <footer className="app-footer"><BrandMark compact /><span>友だちとの予定決めを、もっと楽しく。</span><small>© 2026 AWASO · Supabase連携</small></footer>
    </div>
  );
}
