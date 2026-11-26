# push_subscriptions

## テーブル概要
Web Push通知に利用するブラウザー・端末ごとの送信先を保持する。アカウント削除時はユーザー固有情報として削除する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|送信先識別子。|
|user_id|uuid|FK, NN|所有者の`user_profiles.id`。|
|provider|text|NN|Pushプロバイダー。初版ではFCMを想定する。|
|endpoint_token|text|UK, NN|プロバイダーから発行された送信先トークン。ログ出力・クライアント公開を避ける。|
|created_at|timestamptz|NN|登録日時。|
|updated_at|timestamptz|NN|更新日時。|
|last_used_at|timestamptz||最終送信日時。|

ユーザーが通知を拒否・解除した場合に登録情報を無効化または削除できるようにする。トークンの保持・暗号化方法は運用設計で確定する。
