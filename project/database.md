# データベース設計書

## 概要
Supabase PostgreSQLを使用する。認証はSupabase AuthのGoogle OAuthを利用し、アプリ利用者は`auth.users.id`と同じUUIDを主キーとするプロフィールに対応付ける。グループ単位で企画、日程候補、回答、お気に入りを関連付け、承認済みメンバーだけがアクセスできるようRow Level Security（RLS）を設定する。

コアテーブルは[初回migration](../supabase/migrations/20261126000000_create_core_schema.sql)で作成する。グループ参加申請・承認のアプリ内通知に必要な`notification_deliveries`と招待プレビューRPCは、[招待機能migration](../supabase/migrations/20261126053000_add_group_invitation_support.sql)で追加する。`ai_consent_states`は初版では使用せず、将来、利用者データを外部AIへ送る機能を追加する場合に限り再検討する。`notification_preferences`、`push_subscriptions`およびWeb Push送信は、通知要件・送信方式の決定後に追加する。
アカウント・グループ削除時のStorage API呼び出しや、通常のグループ退会処理はこのmigrationの範囲外であり、サーバー側のトランザクション処理として別途実装する。

|テーブル名|テーブル概要|
|---|---|
|[user_profiles](./database/user_profiles.md)|認証ユーザーのアプリ内プロフィール|
|[ai_consent_states](./database/ai_consent_states.md)|将来、外部AIを導入する場合に限り利用者本人のデータ送信同意を保持|
|[account_deletion_jobs](./database/account_deletion_jobs.md)|アカウント削除処理の段階・再試行状態|
|[account_deletion_job_objects](./database/account_deletion_job_objects.md)|アカウント削除対象のStorageオブジェクトと削除状態|
|[groups](./database/groups.md)|予定調整グループ|
|[group_members](./database/group_members.md)|グループと承認済みメンバーの関連、管理者権限|
|[group_invitations](./database/group_invitations.md)|グループ参加用の有効期限付き招待|
|[group_join_requests](./database/group_join_requests.md)|招待に対する参加申請と管理者の判断|
|[plans](./database/plans.md)|グループ内の遊びの企画|
|[plan_date_candidates](./database/plan_date_candidates.md)|企画の日程候補|
|[plan_date_responses](./database/plan_date_responses.md)|メンバーごとの日程回答|
|[plan_confirmations](./database/plan_confirmations.md)|企画で確定した日時と行き先|
|[places](./database/places.md)|外部地図サービス上の場所識別情報|
|[group_favorites](./database/group_favorites.md)|グループで共有するお気に入りの場所|
|[plan_places](./database/plan_places.md)|企画の行き先候補|
|[plan_memories](./database/plan_memories.md)|企画に紐づく思い出・写真のメタデータ|
|[notification_preferences](./database/notification_preferences.md)|ユーザー単位の通知設定|
|[push_subscriptions](./database/push_subscriptions.md)|Web Pushの送信先情報|
|[notification_deliveries](./database/notification_deliveries.md)|アプリ内通知・Web Pushごとの通知記録、送信状態、重複防止情報|

## 主な関係
- `groups`と`user_profiles`は`group_members`を介して多対多で関連する。
- `ai_consent_states`は初版では作成しない。将来、外部AIを導入する場合に限り、`user_profiles`に1対1で紐づけ、利用者本人のデータ送信同意の最新状態を保持する。
- `groups`は複数の`plans`、`group_invitations`、`group_join_requests`、`group_favorites`を持つ。
- `plans`は複数の日程候補、回答、行き先候補、思い出を持ち、確定時は`plan_confirmations`に確定内容を1件持つ。
- `places`は複数グループのお気に入り、企画の行き先候補、確定予定から参照される。
- `user_profiles`は通知設定・Push送信先を持つ。参加申請・承認結果と確定済み予定の変更はアプリ内通知として記録し、Web Pushは利用者が許可・有効化した場合に限り送る。通知記録は通知先ユーザーと関連する企画または参加申請に紐付ける。
- `account_deletion_jobs`は処理中のプロフィールに1件紐づき、Storage上の削除対象ごとに`account_deletion_job_objects`を持つ。Authユーザー削除が完了するとプロフィールのカスケード削除に伴い、ジョブ情報も消える。

## 設計上のルール
- 主キーはUUIDを基本とし、作成日時・更新日時はタイムゾーン付き日時（`timestamptz`）で保存する。日時候補の入力値は入力者の端末タイムゾーンで解釈して絶対時刻として保存し、利用者のタイムゾーン設定は保存せず、画面表示時に閲覧者の端末タイムゾーンへ変換する。
- 日程回答は候補と回答者の組み合わせを一意にする。集計人数・推薦順位は保存せず、回答データから算出する。
- 承認済みグループメンバーは予定確定前の日程候補を追加・編集できる。確定後の候補編集は企画作成者に限定する。
- 企画作成者は回答締切を任意設定できる。締切後または企画確定後は回答できず、締切未設定なら企画確定まで回答・変更できる。
- アカウント削除は永続化されたジョブで段階管理する。開始時にプロフィールを`deletion_pending`としてアプリとStorageのRLSアクセスを遮断し、対象Storageオブジェクトを追跡する。Storage APIでの削除完了後、DB関連データを1トランザクションで整理し、最後にサーバーからSupabase Authユーザーを削除する。UIには`削除中`、`再試行が必要`、`完了`の状態を表示する。
- StorageオブジェクトはStorage APIで削除し、SQLからStorageのメタデータ行を直接削除しない。対象はユーザーIDを含むパスの一覧と削除対象企画・グループの参照から収集する。削除APIの1回あたりの上限（現行公式資料では1,000件）に合わせて分割し、オブジェクト単位で進捗・再試行状態を保存する。
- 本人が作成した企画、投稿した写真、企画に紐づく本人の回答は削除する。他の利用者の企画・グループに残る共有データは維持し、作者参照をNULLにして本人との紐付けを消す。本人が管理者の場合は既定ルールで移譲し、最後のメンバーならグループと関連データを削除する。
- Supabase Authの削除後も発行済みアクセストークンは期限まで残る可能性があるため、RLSはプロフィールが存在し、かつ`account_status = 'active'`の場合のみアプリデータへのアクセスを許可する。
- グループのお気に入りは、登録者または現在のグループ管理者だけが削除できるようRLSで制御する。
- 参加申請中の利用者のプロフィールは、承認判断に必要な範囲で該当グループの現在の管理者だけが閲覧できる。承認前に申請者へグループデータを開示しない。
- 現在の管理者は`group_members.role`で表す。退会時は`joined_at`が最も早いメンバーへ移譲し、同時刻なら`user_id`昇順で決定する。グループに管理者が1人だけ存在すること、移譲、最後のメンバー退会時のグループ削除は、トランザクションと制約を組み合わせて保証する。
- 日程・行き先は任意の承認済みグループメンバーが全員一致なしで確定できる。確定後の編集は企画作成者に限定する。
- 招待の有効期間は発行時刻から7日間とし、期限後は新規申請を拒否する。期限前に受け付けた申請は管理者が判断するまで自動失効せず、招待期限後も承認できる。
- Google Maps Platformの場所情報は利用規約・保存条件に従う。Google Place IDのみ永続化し、名称・住所・評価などの詳細情報は表示時に必要項目だけ取得し、永続化しない。地図コンテンツの帰属表示とPlaces APIの費用も考慮する。
- 写真本体は非公開Supabase Storageバケットに保存し、DBにはオブジェクトパスなどのメタデータを保存する。Storageにもグループメンバーに基づくアクセス制御を設定する。
- FR-101の初版はアプリ内のルール・テンプレートのみを使い、外部AI・端末内モデル・AI同意テーブルを使用しない。候補は選択されるまで永続化しない。グループの好み学習は対象グループの選択履歴をアプリ内で集計し、外部AIへ送信しない。
- 将来、外部AIを導入する場合は、別途要件を定めたうえで、利用者本人の明示的同意が有効なときに限り現在の依頼に必要な非識別情報のみを送信する。既存の個人・グループ履歴は送信しない。
- グループの好み学習は`group_members.preference_learning_consented_at`が全メンバーについて設定されている場合のみ有効とする。メンバー追加または同意撤回後は、全員同意が再成立するまで停止する。通常機能のため保持されている全期間の明示的な採用・見送りのみを元履歴から都度集計し、閲覧・クリック等の暗黙的行動履歴は使わない。学習専用の履歴や集計データは永続化せず、参照元データの保持・削除は通常機能のルールに従う。
- 全テーブルにRLSを有効化し、グループデータの読み書きでは承認済みメンバーであることを検証する。参加申請の承認・拒否は判断時点のグループ管理者に限定し、企画作成者限定操作、本人の通知設定へのアクセスもポリシーで制御する。サービスロールキーはクライアントに公開しない。

## 未決事項
- 営業時間・評価を表示するか、Google Mapsの利用条件・費用。
- リマインド通知の対象イベント・送信時期・通知設定の粒度。

上記の未決事項に関係する権限・削除処理・保持期間は、実装前に要件を確定する。以下の表は論理設計であり、Supabase/PostgreSQLの実装時にENUM、索引、複合外部キー、トリガー、RLSポリシーを定義する。
