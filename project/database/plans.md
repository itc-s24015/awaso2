# plans

## テーブル概要
グループ内で共有する遊びの企画を保持する。確定後の内容編集権限は企画作成者に限定する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|id|uuid|PK, NN|企画識別子。|
|group_id|uuid|FK, NN|`groups.id`を参照する。グループ削除時は企画と関連データを削除する。|
|created_by|uuid|FK, NN|作成者の`user_profiles.id`。作成者のアカウント削除時は企画と関連データを削除する（`ON DELETE CASCADE`）。|
|title|text|NN|企画名。|
|description|text||企画内容。|
|status|text|NN|`planning`または`confirmed`。CHECK制約で限定する。|
|response_deadline|timestamptz||任意の回答締切。NULLの場合は企画確定まで回答可能。|
|created_at|timestamptz|NN|作成日時。|
|updated_at|timestamptz|NN|更新日時。|

回答締切の設定・変更は企画作成者に限定する。企画作成者以外が確定後の企画内容を更新できないようRLS等で制御する。
