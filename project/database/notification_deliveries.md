# notification_deliveries

## テーブル概要
アプリ内通知とWeb Pushの通知記録をチャネルごとに保持し、同じイベントの重複を防ぐ。参加申請に関する通知は`group_join_request_id`から申請内容を参照する。アカウント削除時は当該ユーザー宛ての記録を削除する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|送信記録識別子。|
|user_id|uuid|FK, NN|通知先の`user_profiles.id`。|
|plan_id|uuid|FK|関連する`plans.id`。企画に依存しない通知ではNULL。|
|group_join_request_id|uuid|FK|関連する`group_join_requests.id`。参加申請に関係しない通知ではNULL。|
|event_type|text|NN|通知対象イベント。|
|title|text|NN|通知一覧に表示する見出し。|
|body|text|NN|通知一覧に表示する説明文。|
|channel|text|NN|`in_app`または`web_push`。CHECK制約で限定する。|
|deduplication_key|text|NN, MK(deduplication_key, channel)|通知先・イベントを特定する重複防止キー。同じイベントを複数チャネルで扱えるようチャネルと組み合わせて一意にする。|
|status|text|NN|`scheduled`、`sent`、`failed`、`cancelled`。CHECK制約で限定する。|
|scheduled_at|timestamptz|NN|送信予定日時。|
|sent_at|timestamptz||送信成功日時。未送信時はNULL。|
|read_at|timestamptz||アプリ内通知を利用者が確認した日時。未読時はNULL。Web PushではNULL。|
|created_at|timestamptz|NN|記録作成日時。|
|updated_at|timestamptz|NN|最終更新日時。|

グループ参加申請・承認結果のアプリ内通知は本テーブルに保存する。利用者は自分宛てのアプリ内通知の`read_at`のみ更新できる。実際のWeb Push送信スケジュール、再試行、失敗情報の保存期間は通知要件・運用方式の決定後に定義する。
