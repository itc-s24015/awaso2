# ai_consent_states

このテーブルは初版では使用しない。将来、利用者データを外部AIサービスへ送る機能を追加する場合に、要件・同意フローを再確認したうえで導入する。

## テーブル概要
外部AIへのデータ送信について、利用者本人の最新の同意状態と付与・撤回日時だけを保持する。過去の同意履歴は保存しない。年齢、生年月日、保護者メールアドレスは取得・保存しない。

## カラム定義
|カラム名|データ型|制約|備考|
|---|---|---|---|
|user_id|uuid|PK, FK, NN|`user_profiles.id`を参照する。プロフィール削除時に本レコードも削除する（`ON DELETE CASCADE`）。|
|user_consent_status|text|NN|`not_consented`、`consented`、`revoked`のいずれか。CHECK制約で限定し、デフォルトは`not_consented`。|
|user_consent_granted_at|timestamptz||本人が最新の同意を付与した日時。|
|user_consent_revoked_at|timestamptz||本人が最新の同意を撤回した日時。|
|created_at|timestamptz|NN|作成日時。|
|updated_at|timestamptz|NN|更新日時。|

AIリクエストは本人の同意状態が`consented`の場合に限り許可する。本人が同意を撤回した場合は状態を`revoked`に更新し、再同意時は最新状態と日時を更新して、過去の同意履歴は追加保存しない。

同意の取得・撤回は利用者本人のアカウント上で行う。本テーブルへの書き込みは認証済みの本人操作をサーバー側で検証して反映する。
