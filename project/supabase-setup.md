# Supabase接続手順

## 1. 環境変数

`.env.local`にSupabaseプロジェクトのProject URLとPublishable keyを設定します。`.env.local`が既にある場合は上書きせず、必要な行だけ追加・更新してください。キー名は`.env.example`を参照できます。旧形式のanon keyを使う場合は、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`の代わりに`NEXT_PUBLIC_SUPABASE_ANON_KEY`を設定できます。

Publishable/anon keyはブラウザーで使用する公開キーです。`service_role`キーはRLSを迂回するため、`.env.local`を含めクライアントコードや公開環境変数に設定しないでください。

## 2. Googleログイン

Supabase DashboardのAuthentication > Sign In / Providers > GoogleでGoogle Providerを有効にし、Google Cloudで発行したOAuth Client IDとClient Secretを設定します。OAuthのコールバックURLには、Supabase Dashboardに表示されるAuth URLをGoogle Cloud側へ登録してください。`Unsupported provider: provider is not enabled`が表示される場合は、URLとPublishable keyが同じSupabaseプロジェクトを指していることも確認してください。

SupabaseのURL Configurationでローカル開発先を許可します。

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

本番環境では、実際に公開するドメインのSite URLと`/auth/callback`も追加してください。

## 3. データベース

Supabase CLIはこのリポジトリの開発依存として追加済みです。ルートディレクトリから`pnpm supabase`で実行します。CLIの対象はローカルDBが既定なので、ホスト済みのSupabaseプロジェクトを操作するときは`--remote`を指定してください。

```sh
pnpm supabase login
pnpm supabase projects list
pnpm supabase link --project-ref YOUR_PROJECT_REF
pnpm supabase migration list --remote
pnpm supabase db push --remote --dry-run
```

一覧とdry-runで接続先および適用対象を確認してから、migrationを適用します。本番環境へ適用する場合は、事前にバックアップを確保してください。

```sh
pnpm supabase db push --remote
pnpm supabase migration list --remote
```

`.env.local`を変更した場合は開発サーバーを再起動します。

```sh
pnpm dev
```

現在、Googleログイン、プロフィール、グループ作成・一覧、企画作成・一覧、招待リンク・コードの発行、参加申請・管理者承認・参加申請通知、日程候補・回答・締切・推薦、Places APIのキーワード検索・お気に入り登録を実装しています。これらの機能を利用するには、すべてのmigrationを適用してください。一般のお知らせなどは引き続きプレビュー表示です。

## 4. Google Maps Platform

場所検索にはPlaces API (New)とGeocoding API、選択した場所の地図表示にはMaps Embed APIを使用します。利用にはGoogle CloudのBilling有効化が必要です。Places・Geocodingは無料利用枠を超えると課金される可能性があり、無料枠自体は課金を止める上限ではありません。料金はアカウントに紐づくプロジェクト間で集計されるため、最新の地域別料金と利用状況を[公式料金表](https://developers.google.com/maps/billing-and-pricing/pricing)で確認してください。Maps Embed APIは現在の公式資料では無料で利用でき、短期・長期のリクエスト上限もありません。

場所名を含むText Search Proは現在のグローバル料金表で月5,000リクエストまで無料、無料枠を超えた最初の料金帯は1,000リクエストあたりUS$32です。名称を含むPlace Details Proも別SKUで月5,000リクエストまで無料、その後の最初の料金帯は1,000リクエストあたりUS$17です。Geocodingは月10,000リクエストまで無料、その後の最初の料金帯は1,000リクエストあたりUS$5です。「お店・飲食店・カフェ」の検索ではPlaces Text Searchを1検索あたり最大3回、「駐車場」では最大1回実行します。地域入力による検索ではGeocoding APIも1回実行します。検索は利用者が検索操作を行ったときだけ、詳細はお気に入り画面で「場所情報を取得」を押したときだけ実行します。Maps Embed APIのiframeは利用者が「地図で見る」を選んだときだけ読み込みます。

1. Google Cloud Consoleでプロジェクトを選び、Places API (New)、Geocoding API、Maps Embed APIを有効化します。
2. Billingを有効化し、Places APIとGeocoding APIの利用量・料金を確認できるようにします。
3. Places API (New)とGeocoding APIに限定したサーバー用APIキーを作成し、`.env.local`およびデプロイ環境のサーバー環境変数に`GOOGLE_MAPS_API_KEY`として設定します。`NEXT_PUBLIC_`を付けず、ブラウザーへ公開しないでください。
4. Maps Embed APIだけにAPI制限したブラウザー用キーを別に作成し、HTTPリファラー制限でローカル開発元・デプロイ先のサイトだけを許可します。このキーはiframeのURLに含まれる公開キーです。`.env.local`およびデプロイ環境に`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY`として設定します。サーバー用キーをブラウザー用に流用しないでください。
5. Places API・Geocoding APIの利用上限と請求アラートを設定し、利用状況を監視してください。アラートだけでは超過課金を防げない点に注意してください。

Places APIの検索結果からはPlace ID・名称・住所・距離計算用の座標のみを要求します。Place ID以外のGoogle Mapsコンテンツは永続化せず、表示時に必要に応じて再取得します。Place IDはGoogle Maps Platformの保存制限の例外ですが、名称などは保存せず、公式の[Places APIポリシー](https://developers.google.com/maps/documentation/places/web-service/policies)に従ってください。画面には「Google Maps」の帰属を表示します。

地域入力時の座標取得にはGeocoding APIを使い、現在地は利用者の許可後にブラウザーから取得します。検索結果は指定半径内にサーバー側で絞り込み、直線距離順に表示します。お店・飲食店・カフェの検索は最大3回のPlaces Text Searchを使うため、請求アラートと利用量を確認してください。FR-007では、検索結果またはお気に入りから選択した1か所をMaps Embed APIで表示します。
