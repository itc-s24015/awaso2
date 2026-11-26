# group_join_requests

## テーブル概要
招待を利用したグループ参加申請と、管理者による承認・拒否結果を保持する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|申請識別子。|
|group_id|uuid|FK, NN|`groups.id`を参照する。|
|invitation_id|uuid|FK, NN|`group_invitations.id`を参照する。|
|user_id|uuid|FK, NN|申請者の`user_profiles.id`。アカウント削除時は本人の申請行を削除する。|
|status|text|NN|`pending`、`approved`、`rejected`。CHECK制約で限定する。|
|requested_at|timestamptz|NN|申請日時。|
|decided_by|uuid|FK|判断時点のグループ管理者の`user_profiles.id`。未判断時、または判断者のアカウント削除後はNULL。|
|decided_at|timestamptz||判断日時。未判断時はNULL。|

同一招待に対する同一ユーザーの重複申請を防ぐ複合一意制約を設定する。`(group_id, invitation_id)`から招待テーブルの同じ組み合わせを参照する複合外部キーを設定する。招待期限前に受け付けた申請は、管理者が判断するまで自動失効せず、招待期限後も承認できる。期限切れを理由に既存申請の状態を自動変更しない。承認・拒否時には、その時点のグループ管理者であることをRLSで検証する。
