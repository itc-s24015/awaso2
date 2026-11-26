# plan_confirmations

## テーブル概要
企画で確定した日程候補と行き先を、企画ごとに1件保持する。確定後の変更は企画作成者だけに許可する。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|plan_id|uuid|PK, FK, NN|`plans.id`を参照する。企画削除時は確定情報も削除する。|
|date_candidate_id|uuid|FK, NN|確定した`plan_date_candidates.id`。同じ企画の候補であることを複合外部キー等で保証する。|
|place_id|uuid|FK, NN|確定した`places.id`。|
|confirmed_by|uuid|FK|確定操作を行ったメンバーの`user_profiles.id`。Auth削除時に`ON DELETE SET NULL`とし、確定情報を残す。|
|confirmed_at|timestamptz|NN|確定日時。|
|updated_at|timestamptz|NN|最終更新日時。|

日程候補と行き先の両方を必須とする。任意の承認済みグループメンバーが全員一致なしで確定できる。確定者がメンバーであることと、確定後の編集が企画作成者に限られることをRLSで検証する。
