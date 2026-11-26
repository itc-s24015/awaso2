# notification_preferences

## テーブル概要
利用者ごとの通知種別・通知方法の受信設定を保持する。参加申請・承認結果と確定済み予定の変更についてはアプリ内通知を常に作成し、この設定は任意のWeb Push送信に適用する。Web Pushはブラウザー通知の許可も必要とする。アカウント削除時はユーザー固有情報として削除する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|user_id|uuid|PK, FK, NN, MK(user_id, event_type, channel)|`user_profiles.id`を参照する。|
|event_type|text|PK, NN, MK(user_id, event_type, channel)|通知対象イベント。例：`join_request_received`、`join_request_decided`、`plan_confirmation_updated`。|
|channel|text|PK, NN, MK(user_id, event_type, channel)|通知方法。任意設定の対象は`web_push`。|
|enabled|boolean|NN|利用者が当該Web Push通知を有効にしているか。|
|updated_at|timestamptz|NN|設定更新日時。|
