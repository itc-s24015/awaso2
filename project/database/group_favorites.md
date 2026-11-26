# group_favorites

## テーブル概要
グループで共有するお気に入りの場所を保持する。同一グループに同じ場所を重複登録しない。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|group_id|uuid|PK, FK, NN, MK(group_id, place_id)|`groups.id`を参照する。|
|place_id|uuid|PK, FK, NN, MK(group_id, place_id)|`places.id`を参照する。|
|added_by|uuid|FK|登録者の`user_profiles.id`。Auth削除時に`ON DELETE SET NULL`とし、共有お気に入りを残す。|
|created_at|timestamptz|NN|登録日時。|

削除は登録者または現在のグループ管理者に限定する。RLSポリシーで対象行の`added_by`またはグループ内の管理者ロールを検証する。`added_by`がNULLの共有お気に入りは現在の管理者だけが削除できる。
