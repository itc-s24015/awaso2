# あわそ向け技術調査

確認日: 2026-11-25

価格・利用条件は更新されるため、採用時に公式ページを再確認する。以下は会話内で確認した公式資料の要約。

## 現在のリポジトリ環境
- package.json: Next.js 16.4.6、React 19.3.0、TypeScript 5、Tailwind CSS 4.3.3、pnpm 12.23.0。
- アプリの土台は既にNext.js/TypeScript。新しいフレームワークは不要。
- [Next.js App Router](https://nextjs.org/docs/app)

## 採用された技術
- **Supabase**: PostgreSQLを中心にAuth、Storage、Realtimeを提供。グループ・企画・メンバー・日時候補など関連データを扱うアプリに適する。Googleサインイン対応。アクセス制御ではRow Level Security（RLS）の設計が必要。
  - [Database overview](https://supabase.com/docs/guides/database/overview)
  - [Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
  - [Realtime](https://supabase.com/docs/guides/realtime)
  - [Pricing](https://supabase.com/pricing): 調査時点ではFreeに500MB DB、非アクティブ7日で停止、Proは月$25から。
- **Google Maps Platform**: Maps JavaScript APIは地図表示、Places APIは店舗・場所検索に利用可能。Dynamic Mapsは月10,000ロードまで無料、その後の最初の料金帯は1,000ロードあたり$7。Placesは別SKU課金なので個別試算が必要。
  - [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview)
  - [Places API](https://developers.google.com/maps/documentation/places/web-service/overview)
  - [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
  - [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies)
  - [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
  - [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id)
  - [Places SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details/places)
  - Nearby Search (New) accepts a circle radius from 0 to 50,000 meters; the request must set a radius greater than zero. This matches the proposed 50km maximum.
  - Nearby Search (New) requires a FieldMask. The response is billed at the highest SKU represented in the requested fields. Display name, address, location and ID are in the Pro field group; opening-hours and rating fields are in the Enterprise field group.
  - Place IDs are exempt from caching restrictions and can be stored indefinitely. Other Google Maps content (including business names, addresses and reviews) generally must not be copied/stored outside the permitted exceptions. Places latitude/longitude has a limited 30-calendar-day cache exception; this project does not persist coordinates.
  - Google Maps content must include required attribution when not shown on a Google Map that already provides it. Request only UI-required fields to reduce unnecessary data and cost.
  - Global pricing page checked 2026-11-25: Nearby Search Pro has a 5,000-event monthly free cap, then starts at $32 per 1,000 events in the first paid tier; Nearby Search Enterprise has a 1,000-event free cap, then starts at $35 per 1,000 events. Higher volume tiers have lower rates; actual cost depends on field mask and monthly usage aggregated for the billing account.

## 比較候補・後続機能
- **Firebase Cloud Firestore**: Webのリアルタイム同期とオフライン対応。調査時点のSpark枠は1GiB、1日50,000 reads/20,000 writes等。NoSQLなので関連データ設計と読み書きコストを検討。
  - [Firestore](https://firebase.google.com/docs/firestore)
  - [Firebase pricing](https://firebase.google.com/pricing)
- **Mapbox Search Box**: 住所・POI・カテゴリ検索。日本語の国内検索について専用資料がある一方、日本向けSearch APIは公式資料上パブリックベータと記載されていた。最終的にGoogle Maps Platformが選択された。
  - [Search Box API](https://docs.mapbox.com/api/search/search-box/)
  - [Japan-specific notes](https://docs.mapbox.com/help/troubleshooting/japan-specific-considerations-search-api/)
  - [Pricing](https://www.mapbox.com/pricing)
- **Firebase Cloud Messaging (FCM)**: 公式料金表ではNo-cost。Web PushはHTTPS、Service Worker、利用者の通知許可が必要。送信はサーバー側の信頼できる環境から行う。
  - [FCM Web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- **Gemini API**: Google AI Studio/Gemini APIのAdditional Terms（2026-03-23発効）では、利用者は18歳以上であること、18歳未満を対象とする・利用される可能性が高いアプリ内で使わないことが定められている。無料サービスではプロンプト・応答がGoogle製品等の改善に使われ、人手レビューされる可能性もあり、機密・個人情報を送らないよう明記されている。有料サービスでは製品改善に使われないが、ポリシー違反検知等のためプロンプト・応答が限定期間ログされ、Google等の施設がある国で一時保存され得る。モデルと入出力トークンに応じた費用が別途発生する。
  - [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
  - [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)
  - This project keeps AI suggestions in the initial scope but must select a provider whose terms permit a consumer-facing student app and its intended age group; Gemini is not selected for this use case pending a compliant alternative.
- **外部AIサービス候補の公式条件（2026-11-25確認）**: いずれもモデル・機能・設定・契約で条件が異なるため、現時点では採用を確定しない。
  - **OpenAI API**: Services AgreementはAPIを顧客アプリへ統合してエンドユーザーに提供することを許可する一方、未成年者が使う場合は親または保護者の同意を要求する。Customer Contentはサービス提供・法令対応・不正防止等に必要な範囲で使い、明示的同意がない限りモデル改善に使わない。APIの不正監視ログは標準で最大30日保持され、Zero Data Retention等は事前承認が必要。未成年者を対象に含めるなら、保護者同意を実際に取得する要件が必要。
    - [Services Agreement](https://openai.com/policies/services-agreement/)（2026-01-01発効）
    - [API data controls and retention](https://developers.openai.com/api/docs/guides/your-data)
    - [Usage Policies](https://openai.com/policies/usage-policies/)
    - [API pricing](https://developers.openai.com/api/docs/pricing/)
  - **Anthropic API**: Commercial TermsがAPIに適用され、顧客が自社アプリをエンドユーザーへ提供する用途は明記されている。商用APIの入力・出力はデフォルトでモデル訓練に使わない。個人向けClaudeのConsumer Termsは18歳以上とするが、APIは別規約であり、調査したCommercial Terms本文だけではアプリのエンドユーザー年齢条件を確定できなかった。また、Termsは消費者利用向けではないとしており、開発者側の契約・アカウント適格性も採用前に確認する。
    - [Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
    - [Consumer Terms](https://www.anthropic.com/legal/consumer-terms)
    - [Commercial data/model training FAQ](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
    - [API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - **Gemini on Google Cloud Vertex AI / Gemini Enterprise Agent Platform**: Gemini APIとは別のGoogle Cloud契約・データ条件。Google Cloud Termsは顧客アプリへの統合を許可し、Service Specific Termsは事前の許可・指示なしに顧客データをAI/MLモデルの訓練・微調整へ使わないとしている。保持ゼロを前提にできるとは限らず、Googleモデルの不正監視プロンプトログ、Advanced AIモデルの追加ログ、Grounding機能のログ、Interactions APIの`store`既定値、キャッシュなど個別の保持条件がある。対象エンドユーザー年齢の適合性は今回の確認だけでは確定できない。
    - [Google Cloud Terms](https://cloud.google.com/terms)
    - [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms)
    - [Vertex AI data governance and retention](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)
    - [Model pricing](https://cloud.google.com/model-garden/pricing)
  - **Azure OpenAI / Models sold by Azure**: Azure上のモデル提供条件では、入力・出力はOpenAI等のモデル提供者に渡らず、Microsoftや第三者の製品改善・基盤モデル訓練にも明示的許可なしには使わない。モデルは基本的にステートレスだが、不正利用監視で検知された場合は一部プロンプト・応答がレビュー向けに保持され得る。Responses API等の状態保存機能は別途データを保存する。新モデルのModified Abuse Monitoring条件に変更予定が記載されており、採用時に再確認が必要。エンドユーザー年齢条件は今回の資料確認だけでは確定できず、価格は地域・デプロイ・モデル依存で料金計算が必要。
    - [Data, privacy, and security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
    - [Azure OpenAI pricing](https://azure.microsoft.com/en-us/pricing/details/azure-openai/)
- **代表的なAPI単価の目安（USD/100万トークン、モデル比較ではない）**: OpenAI GPT-5.4 miniは入力$0.75/出力$4.50、Anthropic Claude Haiku 4.5は入力$1/出力$5、Google Gemini 4 HydrogenのGlobal価格は入力$1.50/出力$7.50と記載。モデル能力・機能は同等とは限らず、税・地域・キャッシュ・プロンプト長・出力長で実額は変わる。Azureは公開料金ページの取得結果で価格欄が動的表示のため、この比較では数値を確定できなかった。月額試算にはモデル選択と1リクエスト当たりの入力・出力トークン数、利用回数が必要。
  - [OpenAI API pricing](https://developers.openai.com/api/docs/pricing/)
  - [Anthropic API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - [Google Cloud model pricing](https://cloud.google.com/model-garden/pricing)
  - [Azure OpenAI pricing](https://azure.microsoft.com/en-us/pricing/details/azure-openai/)
- **Vercel**: Next.jsのホスティング候補。調査時点の料金はHobby $0/月、Pro $20/月。現行規約にはHobby等のコンテンツをAI学習に利用する可能性が記載されていたため、利用者情報を扱う前に規約を確認する。
  - [Next.js hosting](https://vercel.com/docs/frameworks/full-stack/nextjs)
  - [Pricing](https://vercel.com/pricing)
  - [Terms](https://vercel.com/legal/terms)

## 日本向けAI保護者同意の法令・規約確認
確認日: 2026-11-25

- **個人情報保護委員会のQ&A**（令和8年10月30日版）Q1-62は、子どもの同意能力について、対象となる個人情報項目や事業の性質等に応じて個別具体的に判断し、一般には12〜15歳以下について法定代理人等から同意を得る必要があるとする。年齢を一律に18歳とする説明ではない。本プロジェクトは独自に18歳未満全員へ保護者同意を求める、より厳格な要件を維持する。Q&Aはメールリンク等の本人・代理人確認方法を指定していないため、保護者メールへの到達確認だけで代理人同意要件を満たすとは結論できない。
  - [個人情報保護委員会「個人情報の保護に関する法律についてのガイドライン」に関するQ&A（Q1-62）](https://www.ppc.go.jp/personalinfo/faq/APPI_QA/#q1-62)
  - [個人情報保護法（e-Gov法令検索）](https://laws.e-gov.go.jp/document?lawid=415AC0000000057)
- **OpenAI API**: 2026年1月1日発効のServices Agreement 3.3(c)は、親または保護者の同意なしに未成年者にサービスを使わせないよう顧客へ求める。顧客アプリへAPIを統合することは許可するが、同意取得方法をメールリンクに限定・承認する記述は確認できない。
  - [OpenAI Services Agreement](https://openai.com/policies/services-agreement/)
- **Anthropic API**: Commercial Termsは顧客自身のエンドユーザー向け製品をAPIで動かす用途を認める一方、サービスは消費者利用向けではないとしている。適用法令・利用ポリシーへの遵守も顧客に求める。調査したTerms本文では未成年者の利用条件や保護者の確認方法を確定できず、契約主体の適格性も採用前に確認が必要。
  - [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
- **Google Cloud / Vertex AI**: Google Cloudの契約・Service Specific Termsは別途適用されるが、今回確認した資料ではエンドユーザーの年齢要件や保護者確認方法を確定できない。モデル・機能の個別条件を選定時に確認する必要がある。
  - [Google Cloud Terms](https://cloud.google.com/terms)
  - [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms)
- **Azure OpenAI**: Microsoftのモデルデータ取扱い資料はデータ処理・保持を説明するが、保護者同意や確認リンクの年齢要件を定める資料ではない。サービス条件、顧客区分、対象年齢の確認が別途必要。
  - [Microsoft Foundry data, privacy, and security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)

結論: 18歳未満に保護者同意を求める方針自体は本プロジェクトの安全側の要件として維持できる一方、日本法令・AIサービス規約のいずれについても、メールリンク方式だけで親権者・法定代理人による有効な同意を確認できるとは今回の資料から判断できない。実装着手・サービス選定前に法務確認を要する。これは法的助言ではない。

### 要件更新
ユーザーの後続決定により、アプリとAI提案機能に年齢制限を設けず、年齢・生年月日・保護者同意の取得もしない方針へ変更した。さらに外部API利用料0円が必須となったため、従量課金のVertex AIは採用しない。0円での実現方式（ルール・テンプレートまたは端末内ローカルモデル）は保留中。上記の保護者同意調査は参考資料として残すが、現在の要件ではない。
