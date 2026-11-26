# user_profiles

## テーブル概要
Supabase Authのユーザーに紐づくアプリ内プロフィールを保持する。ニックネームは重複を許可する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, FK, NN|`auth.users.id`を参照する。初版のアカウント削除処理で関連データを整理した後に削除する。|
|nickname|text|NN|アプリ内表示名。重複可。|
|account_status|text|NN|`active`または`deletion_pending`。CHECK制約で限定し、デフォルトは`active`。削除処理開始時に後者へ更新し、RLSでアクセスを遮断する。|
|created_at|timestamptz|NN|作成日時。|
|updated_at|timestamptz|NN|更新日時。|

`id`は`auth.users.id`への外部キーに`ON DELETE CASCADE`を指定する。Authユーザー削除の直前までプロフィールを保持し、削除中状態によるRLS遮断を維持する。

