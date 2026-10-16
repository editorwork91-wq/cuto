# دليل مفاتيح CUTO وإعداد الخدمات

هذا الدليل يوضح أين تحصل على كل قيمة، وأين تضعها، وما الذي يعمل حاليًا وما الذي ما زال يحتاج إلى ربط. **لا ترسل أي مفتاح سري في المحادثة ولا تحفظه داخل GitHub أو ملفات الواجهة.**

## 0) نقطة مهمة قبل البدء

CUTO يحتاج إلى مشروع Supabase مستقل. لا تربطه بمشروع YOMY أو بقاعدة بيانات أي تطبيق آخر. أنشئ مشروعًا جديدًا باسم `cuto` من https://supabase.com/dashboard.

المعمارية المستهدفة: Gemini يدير الخطة والوصفة والكابتشن، وGemini TTS ينشئ التعليق الصوتي، وModal يشغّل موديل LTX-2.5 لتوليد المشاهد، وFFmpeg يجمع الفيديو، بينما تحفظ Supabase المهام والملفات الخاصة. يلزم نشر العامل وضبط الأسرار واختبار فيديو فعلي قبل اعتبار المسار جاهزًا للإنتاج.

## 1) القيم المطلوبة للميزات الحالية

| الاسم | أين تحصل عليه؟ | أين يوضع؟ | هل هو سري؟ |
|---|---|---|---|
| `VITE_SUPABASE_URL` | افتح مشروع CUTO في Supabase، ثم Connect أو إعدادات API وانسخ Project URL | ملف `.env.local` محليًا، ومتغير GitHub Actions باسم نفسه للنشر عبر Pages | عنوان مشروع، وليس كلمة مرور |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Connect / API Keys → Publishable key، ويبدأ عادةً بـ `sb_publishable_` | `.env.local` محليًا، ومتغير GitHub Actions للواجهة | مفتاح واجهة عام نسبيًا؛ آمن فقط مع سياسات RLS صحيحة |
| `GEMINI_API_KEY` | Google AI Studio: https://aistudio.google.com/app/apikey | Supabase Dashboard → Edge Functions → Secrets | **سري؛ لا تضفه إلى متغيرات VITE_ أو كود المتصفح** |

في CUTO، المفتاح نفسه `GEMINI_API_KEY` يُستخدم لاستدعاءات Gemini النصية ولصوت Gemini TTS. لا تحتاج إلى مفتاح Google منفصل للصوت. استخدم نموذجًا متاحًا في مشروع Google الخاص بك، وتحقق من القيود والفوترة قبل الإنتاج.

### إنشاء مفتاح Gemini

1. افتح https://aistudio.google.com/app/apikey.
2. سجّل الدخول إلى حساب Google واختر/أنشئ مشروع Google Cloud مناسبًا.
3. أنشئ API key واحفظه في مدير كلمات مرور أو مكان آمن.
4. في Supabase الخاص بـ CUTO افتح Edge Functions ثم Secrets، وأضف `GEMINI_API_KEY`.
5. لا تضع القيمة في `.env.local` للواجهة، ولا في GitHub source أو الرسائل.

إعدادات النموذج ليست مفاتيح، وهي اختيارية:
- `GEMINI_MODEL`: نموذج التخطيط النصي الذي تدعمه واجهة Gemini API.
- `GEMINI_TTS_MODEL`: نموذج توليد الكلام الذي تدعمه واجهة Gemini API.

إذا تغيّرت أسماء النماذج المتاحة، حدّثها في Secrets بعد التحقق من وثائق Google الرسمية: https://ai.google.dev/gemini-api/docs

## 2) إعداد Modal لتوليد المقاطع

Modal هي منصة تشغيل حوسبة/GPU، وليست موديل فيديو بحد ذاتها. العامل الموجود في المستودع يستخدم موديل Lightricks LTX-2.5-Diffusers على GPU داخل Modal لتوليد مشاهد أصلية لكل مشروع. لا يعتمد هذا المسار على Veo أو ملفات فيديو جاهزة أو مكتبات Stock Footage.

المراجع الرسمية:
- لوحة Modal: https://modal.com/
- مفاتيح النشر: https://modal.com/docs/cli/latest/workspace
- طريقة تشغيل التطبيقات: https://modal.com/docs/cli/latest
- نموذج الفيديو LTX-2.5: https://huggingface.co/Lightricks/LTX-2.5-Diffusers
- مثال Modal الرسمي لتوليد الفيديو: https://github.com/modal-labs/modal-examples/tree/main/06_gpu_and_ml/text-to-video

### أ) إعداد Modal مرة واحدة

1. سجّل الدخول إلى Modal، وأنشئ Workspace/Environment مناسبًا لمشروع CUTO.
2. لن تحتاج إلى تشغيل سيرفر على حاسوبك. يمكن نشر العامل من GitHub Actions بعد دمج هذا الفرع في main. من Modal أنشئ API token مخصصًا للنشر، ثم في GitHub افتح Settings → Secrets and variables → Actions وأنشئ Repository secrets باسم MODAL_TOKEN_ID وMODAL_TOKEN_SECRET. هاتان القيمتان خاصتان بنشر التطبيق، وليستا Modal Proxy Token اللذين سيُستخدمان لاحقًا للاتصال من Supabase.
3. افتح بطاقة موديل LTX-2.5 على Hugging Face واقرأ شروط الترخيص الحالية، ووافق عليها إن طُلب ذلك قبل الاستخدام التجاري.
4. في Modal Dashboard افتح Secrets وأنشئ Secret باسم cuto-supabase-worker.
5. أضف داخل هذا الـ Secret القيم التالية: SUPABASE_URL (رابط مشروع CUTO)، وSUPABASE_SERVICE_ROLE_KEY (مفتاح سرّي خادمي من مشروع CUTO فقط). أضف HF_TOKEN فقط إذا كانت صلاحية تنزيل النموذج تتطلبه. لا تستخدم أي مفتاح من مشروع YOMY.
6. بعد دمج الفرع في main وإضافة MODAL_TOKEN_ID وMODAL_TOKEN_SECRET إلى GitHub Secrets، افتح GitHub → Actions → Deploy CUTO Modal Video Worker → Run workflow. سيشغّل GitHub مهمة النشر بدلًا من احتياجك إلى سيرفر أو تثبيت الأدوات محليًا. يجب أن يكون Secret المسمى cuto-supabase-worker موجودًا في Modal قبل بدء النشر.
7. انسخ عنوان endpoint الذي يعرضه النشر لدالة submit_video. احتفظ بالرابط كما هو؛ لا تنشئ endpoint من الواجهة الأمامية.

العامل يشغّل موديل LTX-2.5 على GPU من Modal، ويحفظ المقاطع الناتجة إلى bucket الخاص cuto-assets، ويحدّث صف مهمة الفيديو في Supabase. يحتاج أول تشغيل إلى تنزيل أوزان النموذج، وقد يكون أبطأ من التشغيل بعد تجهيز الكاش.

### ب) حماية endpoint بين Supabase وModal

1. في Modal أنشئ Proxy Auth Token مناسبًا للـ endpoint، واتبع الوثائق: https://modal.com/docs/guide/webhook-proxy-auth
2. احتفظ بقيمة Token ID التي تبدأ عادةً بـ wk-، وبالقيمة المقابلة Secret التي تبدأ عادةً بـ ws-.
3. افتح Supabase الخاص بـ CUTO → Edge Functions → Secrets، وأضف هذه الأسماء الثلاثة:
   - MODAL_VIDEO_ENDPOINT_URL: رابط submit_video الذي حصلت عليه بعد النشر.
   - MODAL_KEY: قيمة Modal proxy token ID.
   - MODAL_SECRET: سر الـ proxy token المقابل.
4. لا تضع هذه القيم في VITE_ variables، أو GitHub source، أو ملفات الواجهة. ولا تشاركها في المحادثة.

## 2.1) مفاتيح Google للصوت والسيناريو

| الاسم | الغرض | المصدر | مكان التخزين |
|---|---|---|---|
| GEMINI_API_KEY | Gemini لمدير القناة والوصفة والكابتشن، وكذلك Gemini TTS للصوت | https://aistudio.google.com/app/apikey | Supabase → Edge Functions → Secrets |
| GEMINI_MODEL | اختياري؛ نموذج Gemini الافتراضي لتخطيط القناة والوصفة | وثائق Gemini API | Supabase → Edge Functions → Secrets |
| GEMINI_TTS_MODEL | اختياري؛ نموذج Gemini TTS المدعوم في مشروع Google | https://ai.google.dev/gemini-api/docs/speech-generation | Supabase → Edge Functions → Secrets |

لا يوجد مفتاح مطلوب باسم GOOGLE_FLOW_API_KEY في مسار Modal. Flow منتج Google منفصل عبر واجهته؛ في هذا المسار توليد المقاطع يتم بواسطة LTX-2.5 على Modal. أما التعليق الصوتي فيأتي من Gemini TTS كما طلبت.

## 3) إعداد الواجهة محليًا

1. انسخ `.env.example` إلى `.env.local`.
2. ضع القيمتين العامتين فقط:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
   ```
3. لا تضف أي مفتاح مزود سري إلى متغير يبدأ بـ `VITE_`؛ متغيرات Vite المسبوقة بـ `VITE_` تدخل حزمة المتصفح ويمكن للمستخدمين رؤيتها.
4. شغّل `npm install` ثم `npm run dev`.

## 4) إعداد GitHub Pages

في مستودع CUTO:

1. Settings → Secrets and variables → Actions → Variables.
2. أنشئ Repository variables بالاسمين `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY` لأن Workflow النشر يقرأهما من `vars.*`.
3. Settings → Pages → Build and deployment؛ اختر GitHub Actions مصدرًا للنشر.
4. Actions → Deploy CUTO preview to GitHub Pages → Run workflow.

القيمتان السابقتان خاصتان بتهيئة الواجهة وليستا مفاتيح خادم. لا تضع `GEMINI_API_KEY` أو `PEXELS_API_KEY` أو `CREATOMATE_API_KEY` في GitHub Pages variables.

## 5) تجهيز Supabase

1. أنشئ مشروع CUTO منفصلًا، ثم انسخ Project URL وPublishable key.
2. افتح SQL Editor داخل مشروع CUTO ونفّذ migration الأساسية الموجودة في `supabase/migrations/` بالترتيب. راجع أسماء الملفات الحالية في المستودع قبل التنفيذ؛ لا تعِد تنفيذ ترحيل سابق دون داعٍ.
3. تحقق من تفعيل Email provider في Authentication → Sign In / Providers.
4. أضف عنوان النشر في Authentication → URL Configuration: Site URL وRedirect URLs. أثناء التطوير أضف عنوان Vite المحلي، ثم أضف نطاق الإنتاج الحقيقي بعد نشر الموقع.
5. طبّق ترحيلات قاعدة البيانات الموجودة في المستودع بالترتيب، بما فيها ترحيل video_render_jobs. هذه الخطوة تنشئ سجل المهام وتضيف سياسات القراءة الخاصة بها.
6. انشر الوظائف: channel-director وrecipe-director وvoice-preview وgenerate-narration وmodal-render-start وmodal-render-status مع تفعيل JWT verification.
7. أضف GEMINI_API_KEY وMODAL_VIDEO_ENDPOINT_URL وMODAL_KEY وMODAL_SECRET إلى Edge Functions → Secrets. أضف GEMINI_MODEL وGEMINI_TTS_MODEL فقط إذا أردت تغيير النموذج الافتراضي.
8. اختبر إنشاء القناة والخطة والصوت أولًا، ثم ابدأ توليد فيديو قصير واختبر متابعة التقدم والتنزيل. تأكد أن cuto-assets خاص وسياسات RLS تمنع المستخدم من قراءة ملفات مستخدم آخر.

لا تستخدم مشروع YOMY الموجود لديك لـ CUTO، ولا تنسخ فيه migrations الخاصة بهذا المشروع.

## 6) مفاتيح لا تحتاج إلى وضعها في الواجهة

- لا تضع `service_role` أو مفاتيح Supabase السرية في المتصفح. هذه مفاتيح مرتفعة الصلاحية ويمكنها تجاوز RLS.
- لا تضف مفتاح Modal إلى كود المتصفح؛ الاتصال مع Modal يمر عبر Edge Function موثّقة.
- لا تحتاج إلى مفتاح منفصل لصوت Gemini؛ الصوت يستخدم GEMINI_API_KEY.
- لا تضع SUPABASE_SERVICE_ROLE_KEY في الواجهة أو GitHub؛ العامل في Modal يحتاجه فقط داخل Modal Secret خادمي لتحديث المهام وحفظ ملفات المستخدمين.
- كلمة مرور قاعدة البيانات ليست API key؛ احتفظ بها بشكل آمن، ولا تستخدمها في كود الواجهة.

## 7) قائمة اختبار قبل اعتبار المهمة مكتملة

- [ ] تسجيل حساب جديد بالبريد وتأكيده.
- [ ] الدخول والخروج وإعادة تعيين كلمة المرور.
- [ ] حفظ تفضيلات اللغة والصوت والنيش ومدة الفيديو بعد إعادة تسجيل الدخول.
- [ ] لا يستطيع الحساب إنشاء أكثر من قناتين، حتى مع طلبات متزامنة.
- [ ] مستخدمان مختلفان لا يستطيع أحدهما قراءة قنوات أو ملفات الآخر.
- [ ] تعمل وظيفة استراتيجية القناة وخطة الوصفة وتوليد WAV.
- [ ] ينشر العامل إلى Modal ويستطيع توليد مقطع اختبار من LTX-2.5.
- [ ] يتم حفظ المقاطع الأصلية في cuto-assets الخاص، ويظل bucket غير عام.
- [ ] يتم حفظ حالة المهمة في قاعدة البيانات وتحديث شريط التقدم من worker موثوق، وليس من مؤقت في المتصفح.
- [ ] يظهر رابط MP4 فقط بعد أن يؤكد مزود الرندر اكتماله.
- [ ] اختبار إخراج 9:16، والصوت، والترجمة، واسم القناة الأبيض ضمن الهوامش الآمنة.
- [ ] قياس وقت عدة عمليات فعلية قبل الإعلان عن حد خمس دقائق.

**لا تعتبر نسخة CUTO مكتملة بالكامل بمجرد حفظ المفاتيح.** يجب تطبيق migrations على مشروع CUTO المقصود، ونشر Edge Functions وعامل Modal، ثم تشغيل اختبارات فعلية من إنشاء الوصفة حتى تنزيل MP4.
