# plan_memories

## テーブル概要
企画に紐づく思い出の文章と写真メタデータを保持する。画像本体は非公開Supabase Storageバケットに保存する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|思い出識別子。|
|plan_id|uuid|FK, NN|`plans.id`を参照する。企画削除時はレコードを削除する。|
|created_by|uuid|FK|登録者の`user_profiles.id`。Auth削除時に`ON DELETE SET NULL`とし、共有コンテンツを残す。|
|content|text||任意の思い出・説明文。|
|storage_path|text||Storage上のオブジェクトパス。利用者単位で列挙できるよう、アップロード時にユーザーIDを含むパスを使う。文章のみの場合はNULL。|
|created_at|timestamptz|NN|登録日時。|
|updated_at|timestamptz|NN|更新日時。|

`content`と`storage_path`の少なくとも一方を必須にするCHECK制約を設定する。企画メンバー以外がレコードやStorageオブジェクトへアクセスできないよう制御する。アカウント削除者が投稿した写真ファイルは削除し、他の利用者の企画にある文章等の共有コンテンツは保持して作者参照をNULLにする。写真と文章が同じレコードにある場合は、Storageオブジェクトを削除してパスをNULLにし、文章を残す。両方なくなるレコードは削除する。
