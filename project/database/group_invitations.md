# group_invitations

## テーブル概要
グループへの参加申請に使用する招待を保持する。招待リンク・コードの秘密部分そのものではなく、検証用ハッシュを保存する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|招待識別子。|
|group_id|uuid|FK, NN|`groups.id`を参照する。グループ削除時は招待も削除する。|
|issued_by|uuid|FK|`user_profiles.id`を参照する。発行者。Auth削除時に`ON DELETE SET NULL`とし、共有招待を残す。|
|token_hash|text|UK, NN|十分な乱数の招待トークンをハッシュ化した値。|
|created_at|timestamptz|NN|発行日時。|
|expires_at|timestamptz|NN|発行から7日後。期限後の新規申請を拒否するが、期限前に受け付けた申請の承認には影響しない。|

`(group_id, id)`の複合一意制約を設け、参加申請のグループと招待の所属グループが一致することを複合外部キーで保証する。
