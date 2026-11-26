# plan_places

## テーブル概要
企画で検討する行き先候補を保持する。お気に入りから選んだ場所も、検索結果から企画候補へ直接追加した場所も参照できる。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|plan_id|uuid|PK, FK, NN, MK(plan_id, place_id)|`plans.id`を参照する。|
|place_id|uuid|PK, FK, NN, MK(plan_id, place_id)|`places.id`を参照する。|
|added_by|uuid|FK|候補を追加した`user_profiles.id`。Auth削除時に`ON DELETE SET NULL`とし、共有候補を残す。|
|created_at|timestamptz|NN|追加日時。|
