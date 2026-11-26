# groups

## テーブル概要
友達との予定調整に使うグループを保持する。現在の管理者と参加者は`group_members`で管理する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|グループ識別子。|
|name|text|NN|グループ名。|
|created_at|timestamptz|NN|作成日時。|
|updated_at|timestamptz|NN|更新日時。|
