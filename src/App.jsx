import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpLeft, AudioLines, Bell, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Clock3, CookingPot,
  Download, ExternalLink, FileText, Film, FolderKanban, Globe2, LayoutDashboard,
  LoaderCircle, LogOut, Menu, Mic2, MoreHorizontal, Plus, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Sprout, UserRound, WandSparkles, Copy, Hash,
  X, Play, LockKeyhole, Video, Volume2, Layers3
} from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase.js'

const HERO_IMAGE = 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1800&q=88'
const FOOD_IMAGE_2 = 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82'
const FOOD_IMAGE_3 = 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=82'

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* local preview is best-effort */ }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createPromptPack(channel) {
  const languageName = ({ 'ar-EG': 'العربية باللهجة المصرية', 'ar': 'العربية الفصحى', 'en': 'الإنجليزية', 'tr': 'التركية' })[channel.language] || channel.language || 'العربية باللهجة المصرية'
  const voiceName = channel.voice_gender === 'male' ? 'رجالي' : 'نسائي'
  return {
    identity: `أنت مدير المحتوى الإبداعي لقناة «${channel.name}» ذات النيش: ${channel.niche}. الجمهور المستهدف: ${channel.audience || 'محبو هذا المحتوى'}. حافظ على شخصية متسقة، واضحة، وجديرة بالثقة.`,
    script: `اكتب سيناريو فيديو قصير باللغة ${languageName}. ابدأ بخطاف جذاب دون مبالغة، ثم قدّم خطوات دقيقة وقابلة للتنفيذ، واختم بدعوة لطيفة للتفاعل. لا تخترع معلومات أو مقادير.`,
    voice: `التعليق الصوتي الافتراضي: صوت ${voiceName}، ${languageName}، بنبرة طبيعية ودافئة وسرعة مفهومة.`,
    visuals: `أنشئ قائمة لقطات عمودية 9:16 بأسلوب ${channel.visual_style || 'سينمائي واقعي'}، بإضاءة متناسقة، واستمرارية بصرية، ولقطات مقربة مفيدة. تجنب المشاهد غير المرتبطة بالمحتوى.`,
    edit: `مقاس 9:16، مدة افتراضية ${channel.default_duration_seconds || 45} ثانية، ترجمة ${channel.captions_enabled ? 'عربية متزامنة' : 'متوقفة'}، وهوية القناة ${channel.watermark_enabled ? 'باللون الأبيض أسفل الفيديو' : 'من دون علامة مائية'}.`,
  }
}

function buildPreviewPlan(idea, channel, duration = 45) {
  const recipe = idea.trim().replace(/[.!؟]+$/, '')
  return {
    title: recipe.slice(0, 72) || 'فكرة فيديو جديدة',
    summary: `خطة أولية لمحتوى «${channel?.name || 'قناتك'}» — راجع المقادير والتفاصيل قبل النشر.`,
    duration_seconds: Number(duration),
    language: channel?.language || 'ar-EG',
    voice_gender: channel?.voice_gender || 'female',
    hook: `استنوا معايا… النهارده هنعمل ${recipe || 'وصفة جديدة'} بطريقة سهلة.`,
    steps: [
      { title: 'افتتاحية جذابة', detail: 'لقطة قريبة للنتيجة النهائية مع جملة افتتاحية قصيرة.', seconds: 4 },
      { title: 'تجهيز المكونات', detail: 'اعرض المكونات بوضوح مع أسمائها على الشاشة. راجع الكميات وفقًا للوصفة الفعلية.', seconds: 8 },
      { title: 'خطوات التحضير', detail: 'قسّم التحضير إلى لقطات قصيرة متتابعة، مع توضيح الحركة الأساسية في كل لقطة.', seconds: Math.max(15, Number(duration) - 18) },
      { title: 'اللقطة النهائية', detail: 'لقطة تقديم جذابة، ثم اسم القناة واسم المستخدم في أسفل الفيديو.', seconds: 6 },
    ],
    shot_list: [
      'لقطة افتتاحية عمودية مولّدة بالذكاء الاصطناعي للطبق النهائي',
      'لقطة علوية مولّدة بالذكاء الاصطناعي للمكونات مرتبة على سطح نظيف',
      'لقطات قريبة مولّدة بالذكاء الاصطناعي لخطوات التحضير',
      'لقطة نهائية مولّدة بالذكاء الاصطناعي مع هوية القناة',
    ],
    publishing_pack: {
      primary_caption: `وصفة ${recipe || 'جديدة'} بخطوات واضحة ومن غير تعقيد 🍽️ احفظوا الفيديو وجرّبوها، وقولوا لنا رأيكم!`,
      platforms: [
        { id: 'tiktok', name: 'TikTok', caption: `مين هيجرّب ${recipe || 'الوصفة'}؟ 👀🍽️ شوفوا الخطوات للآخر واحفظوا الفيديو علشان ترجعوله وقت التحضير.`, cta: 'اكتبوا في التعليقات تحبوا الوصفة الجاية تكون إيه.', hashtags: ['#طبخ', '#وصفات', '#وصفات_سهلة', '#CUTO'] },
        { id: 'instagram_reels', name: 'Instagram Reels', caption: `${recipe || 'وصفة جديدة'} بطريقة بسيطة وخطوات واضحة ✨🍽️ احفظوا الريل علشان تجربوها بعدين.`, cta: 'اعملوا منشن للشخص اللي هيحب يجربها معاكم.', hashtags: ['#وصفات', '#طبخ_بيتي', '#ريلز', '#CUTO'] },
        { id: 'youtube_shorts', name: 'YouTube Shorts', title: `${(recipe || 'وصفة سهلة').slice(0, 76)} | وصفة سهلة #Shorts`, caption: `في الفيديو ده بنحضّر ${recipe || 'وصفة جديدة'} بخطوات واضحة. راجعوا المقادير المكتوبة داخل الفيديو قبل البدء، واشتركوا لمزيد من الوصفات.`, cta: 'اكتبوا اسم الوصفة اللي تحبوا تشوفوها بعد كده.', hashtags: ['#Shorts', '#وصفات', '#طبخ'] },
        { id: 'facebook_reels', name: 'Facebook Reels', caption: `جربوا ${recipe || 'الوصفة'} دي وشاركونا النتيجة 🍽️ خطوات بسيطة ومناسبة إنكم ترجعوا لها وقت التحضير.`, cta: 'شاركونا نصائحكم أو تعديلاتكم في التعليقات.', hashtags: ['#وصفات', '#مطبخ', '#طبخ_بيتي', '#CUTO'] },
      ],
      pinned_comment: 'إيه الوصفة اللي تحبوا نشوفها في الفيديو الجاي؟ اكتبوا اقتراحكم 👇',
      thumbnail_text: (recipe || 'وصفة سهلة').slice(0, 28),
      seo_keywords: [recipe || 'وصفة جديدة', 'وصفات سهلة', 'طبخ منزلي'],
    },
    note: 'معاينة توضيحية محلية فقط؛ لم يتم استدعاء نموذج ذكاء اصطناعي أو إنشاء ملف MP4. الكابتشن المعروض مثال مبدئي.',
  }
}

const defaultSetup = {
  channelName: '',
  username: '',
  niche: '',
  audience: '',
  language: 'ar-EG',
  voiceGender: 'female',
  visualStyle: 'سينمائي واقعي',
  captions: true,
  watermark: true,
  duration: '45',
}

function Toast({ toast, onClose }) {
  if (!toast) return null
  return (
    <div className={`toast ${toast.type || ''}`} role="status">
      {toast.type === 'error' ? <CircleHelp size={18} /> : <CheckCircle2 size={18} />}
      <span>{toast.message}</span>
      <button className="icon-button toast-close" onClick={onClose} aria-label="إغلاق"><X size={15} /></button>
    </div>
  )
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-symbol"><Clapperboard size={20} strokeWidth={1.8} /></span>
      <span className="brand-word">CUTO<span className="brand-dot">.</span></span>
    </div>
  )
}

function AuthScreen({ mode, setMode, onSubmit, loading, message, credentials, setCredentials }) {
  return (
    <main className="auth-screen">
      <div className="auth-backdrop" style={{ backgroundImage: `url("${HERO_IMAGE}")` }} />
      <div className="auth-shade" />
      <div className="auth-top"><Brand /><span className="privacy-note"><ShieldCheck size={15} /> مساحة خاصة بصنّاع المحتوى</span></div>
      <section className="auth-card glass-panel">
        <div className="auth-mark"><LockKeyhole size={23} /></div>
        <p className="eyebrow">CUTO CREATOR STUDIO</p>
        <h1>{mode === 'signup' ? 'ابدأ قصتك الإبداعية' : 'أهلًا بعودتك'}</h1>
        <p className="muted">{mode === 'signup' ? 'أنشئ حسابك، ثم دعنا نجهّز استوديو القناة على طريقتك.' : 'سجّل الدخول للوصول إلى قنواتك ومشروعاتك.'}</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label htmlFor="auth-email">البريد الإلكتروني</label>
          <input id="auth-email" autoComplete="email" type="email" required value={credentials.email} onChange={e => setCredentials(v => ({ ...v, email: e.target.value }))} placeholder="you@example.com" dir="ltr" />
          <label htmlFor="auth-password">كلمة المرور</label>
          <input id="auth-password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} type="password" required value={credentials.password} onChange={e => setCredentials(v => ({ ...v, password: e.target.value }))} placeholder="٨ أحرف على الأقل" />
          {message && <div className="form-message">{message}</div>}
          <button className="primary-button full-width" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : null}
            {loading ? 'جارٍ التحقق…' : mode === 'signup' ? 'إنشاء حساب' : 'تسجيل الدخول'}
            {!loading && <ArrowUpLeft size={17} />}
          </button>
        </form>
        <div className="auth-switch">
          <span>{mode === 'signup' ? 'عندك حساب بالفعل؟' : 'أول مرة هنا؟'}</span>
          <button className="text-button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'سجّل الدخول' : 'أنشئ حسابًا جديدًا'}</button>
        </div>
        <p className="auth-foot"><ShieldCheck size={14} /> تسجيل آمن عبر Supabase Auth</p>
      </section>
      <p className="auth-legal">بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية الخاصة بـ CUTO.</p>
    </main>
  )
}

function Onboarding({ setup, setSetup, step, setStep, onSubmit, onClose, loading, adding, editing, error, onPreviewVoice, voicePreviewUrl, voicePreviewLoading, clearVoicePreview }) {
  const update = (key, value) => { if (key === 'voiceGender' || key === 'language') clearVoicePreview?.(); setSetup(current => ({ ...current, [key]: value })) }
  const next = e => {
    e.preventDefault()
    if (step < 3) { setStep(step + 1); return }
    onSubmit()
  }
  return (
    <main className="onboarding-screen">
      <header className="onboarding-header">
        <Brand />
        <div className="onboarding-header-note"><span className="status-dot" /> مساحة إبداعك تبدأ هنا</div>
        {adding && <button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={20} /></button>}
      </header>
      <div className="onboarding-layout">
        <section className="onboarding-form-wrap">
          <div className="onboarding-step-label"><span>تهيئة الاستوديو</span><span>0{step} <i>/ 03</i></span></div>
          <div className="step-track"><span style={{ width: `${(step / 3) * 100}%` }} /></div>
          <div className="onboarding-heading">
            <span className="section-kicker">{step === 1 ? '01 / هوية القناة' : step === 2 ? '02 / الجمهور والأسلوب' : '03 / إعدادات الإنتاج'}</span>
            <h1>{step === 1 ? 'خلّينا نتعرّف على قناتك.' : step === 2 ? 'مين الناس اللي بتكلمهم؟' : 'اختار أسلوبك الافتراضي.'}</h1>
            <p>{step === 1 ? 'وصف بسيط منك كفاية. CUTO هيستخرج النيش، ويبني أساس البرومبتات وهوية المحتوى.' : step === 2 ? 'إجاباتك هتساعدنا نحافظ على نبرة وشكل متّسقين في كل فيديو.' : 'الإعدادات دي هتتطبق تلقائيًا على كل مشروع جديد، وتقدر تغيّرها بعدين.'}</p>
          </div>
          <form className="setup-form" onSubmit={next}>
            {step === 1 && (
              <>
                <div className="field">
                  <label htmlFor="channel-name">اسم القناة <span className="required">*</span></label>
                  <input id="channel-name" required maxLength={70} value={setup.channelName} onChange={e => update('channelName', e.target.value)} placeholder="مثال: مطبخي معايا" />
                </div>
                <div className="field">
                  <label htmlFor="channel-username">اسم المستخدم <span className="required">*</span></label>
                  <div className="handle-input" dir="ltr"><span>@</span><input id="channel-username" required maxLength={30} pattern="[A-Za-z0-9_.-]+" value={setup.username.replace(/^@/, '')} onChange={e => update('username', e.target.value.replace(/^@/, ''))} placeholder="matbakhi" /></div>
                  <small>استخدم حروفًا إنجليزية وأرقامًا وشرطة سفلية أو نقطة.</small>
                </div>
                <div className="field">
                  <label htmlFor="channel-niche">احكي لنا القناة بتقدّم إيه <span className="required">*</span></label>
                  <textarea id="channel-niche" required rows="3" maxLength={700} value={setup.niche} onChange={e => update('niche', e.target.value)} placeholder="مثال: وصفات مصرية سهلة واقتصادية، بمكونات موجودة في كل بيت، وشرح بسيط للمبتدئين…" />
                  <div className="field-meta"><small>اكتب بطريقتك العادية — من غير أي مصطلحات تقنية.</small><small>{setup.niche.length}/700</small></div>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div className="field">
                  <label htmlFor="channel-audience">مين جمهور القناة؟</label>
                  <input id="channel-audience" value={setup.audience} onChange={e => update('audience', e.target.value)} placeholder="مثال: الأسر، الطلبة، والمبتدئون" />
                </div>
                <div className="field">
                  <label>الشكل البصري للفيديو</label>
                  <div className="choice-grid visual-choices">
                    {[
                      { id: 'سينمائي واقعي', title: 'سينمائي واقعي', note: 'إضاءة ناعمة وتفاصيل واضحة', icon: <Film size={18} /> },
                      { id: 'منزلي ودافئ', title: 'منزلي ودافئ', note: 'إحساس طبيعي ومريح', icon: <CookingPot size={18} /> },
                      { id: 'سريع وجذاب', title: 'سريع وجذاب', note: 'إيقاع مناسب للسوشيال', icon: <Video size={18} /> },
                    ].map(choice => <button type="button" key={choice.id} className={`choice-card ${setup.visualStyle === choice.id ? 'selected' : ''}`} onClick={() => update('visualStyle', choice.id)}><span className="choice-icon">{choice.icon}</span><strong>{choice.title}</strong><small>{choice.note}</small>{setup.visualStyle === choice.id && <Check className="choice-check" size={16} />}</button>)}
                  </div>
                </div>
                <div className="field">
                  <label>الترجمة على الشاشة</label>
                  <div className="toggle-row">
                    <div><strong>ترجمة تلقائية</strong><small>عبارات عربية متزامنة مع التعليق الصوتي</small></div>
                    <button type="button" role="switch" aria-checked={setup.captions} className={`switch ${setup.captions ? 'on' : ''}`} onClick={() => update('captions', !setup.captions)}><span /></button>
                  </div>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="field">
                  <label>الصوت الافتراضي</label>
                  <div className="voice-options">
                    <button type="button" className={`voice-option ${setup.voiceGender === 'female' ? 'selected' : ''}`} onClick={() => update('voiceGender', 'female')}><span className="voice-avatar"><AudioLines size={19} /></span><span><strong>صوت نسائي</strong><small>طبيعي وودود</small></span>{setup.voiceGender === 'female' && <CheckCircle2 size={18} />}</button>
                    <button type="button" className={`voice-option ${setup.voiceGender === 'male' ? 'selected' : ''}`} onClick={() => update('voiceGender', 'male')}><span className="voice-avatar"><Volume2 size={19} /></span><span><strong>صوت رجالي</strong><small>واضح ومتوازن</small></span>{setup.voiceGender === 'male' && <CheckCircle2 size={18} />}</button>
                  </div>
                  <div className="voice-preview-row">
                    <div className="voice-preview-copy"><strong>اسمع عيّنة من الصوت</strong><small>معاينة بالتفضيلات الحالية قبل حفظ القناة.</small></div>
                    <button type="button" className="voice-preview-button" onClick={onPreviewVoice} disabled={voicePreviewLoading}>
                      {voicePreviewLoading ? <LoaderCircle className="spin" size={15} /> : <Play size={15} fill="currentColor" />}
                      {voicePreviewLoading ? 'جارٍ تجهيز العينة…' : 'معاينة الصوت'}
                    </button>
                  </div>
                  {voicePreviewUrl && <audio className="voice-audio-preview" controls preload="none" src={voicePreviewUrl}>متصفحك لا يدعم تشغيل الصوت.</audio>}
                </div>
                <div className="field">
                  <label htmlFor="setup-language">اللغة واللهجة الافتراضية</label>
                  <div className="select-wrap"><Globe2 size={17} /><select id="setup-language" value={setup.language} onChange={e => update('language', e.target.value)}><option value="ar-EG">العربية — اللهجة المصرية</option><option value="ar">العربية الفصحى</option><option value="en">English — الإنجليزية</option><option value="tr">Türkçe — التركية</option></select><ChevronDown size={16} /></div>
                </div>
                <div className="field">
                  <label>مدة الفيديو المستهدفة</label>
                  <div className="duration-options">
                    {['30', '45', '60'].map(d => <button type="button" key={d} className={`duration-chip ${setup.duration === d ? 'selected' : ''}`} onClick={() => update('duration', d)}>{d} ثانية</button>)}
                  </div>
                </div>
                <div className="toggle-row watermark-toggle">
                  <div><strong>هوية القناة على الفيديو</strong><small>اسم القناة و@username باللون الأبيض أسفل الفيديو</small></div>
                  <button type="button" role="switch" aria-checked={setup.watermark} className={`switch ${setup.watermark ? 'on' : ''}`} onClick={() => update('watermark', !setup.watermark)}><span /></button>
                </div>
                <div className="summary-strip"><ShieldCheck size={18} /><span>هنحفظ الإعدادات دي كافتراضيات لقناتك. تقدر تعدّلها في أي وقت.</span></div>
              </>
            )}
            {error && <div className="inline-error">{error}</div>}
            <div className="form-footer">
              {step > 1 ? <button type="button" className="secondary-button" onClick={() => setStep(step - 1)}><ChevronRight size={17} /> السابق</button> : <span className="form-security"><LockKeyhole size={13} /> إعداداتك خاصة بحسابك</span>}
              <button type="submit" className="primary-button" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}{loading ? 'جارٍ تجهيز الاستوديو…' : step < 3 ? 'متابعة' : editing ? 'حفظ التغييرات' : adding ? 'إضافة القناة' : 'جهّز استوديو قناتي'}{!loading && <ArrowUpLeft size={17} />}</button>
            </div>
          </form>
        </section>
        <aside className="onboarding-visual">
          <div className="onboarding-photo" style={{ backgroundImage: `url("${HERO_IMAGE}")` }} />
          <div className="onboarding-photo-shade" />
          <div className="visual-copy">
            <span className="visual-tag"><Sprout size={14} /> بداية أذكى للمحتوى</span>
            <h2>كل قناة ليها حكاية.<br /><em>CUTO يساعدك تحكيها.</em></h2>
            <p>من وصفك البسيط، نرتّب النيش، ونبرة الصوت، وشكل الفيديو، وتعليمات الإنتاج في هوية واحدة متّسقة.</p>
            <div className="visual-feature-list">
              <span><CheckCircle2 size={16} /> برومبتات مصممة لنيشك</span>
              <span><CheckCircle2 size={16} /> صوت ولغة افتراضيان</span>
              <span><CheckCircle2 size={16} /> إعداد واحد لكل فيديو</span>
            </div>
          </div>
          <div className="floating-preview">
            <div className="mini-video-frame" style={{ backgroundImage: `url("${FOOD_IMAGE_2}")` }}><span className="mini-play"><Play size={13} fill="currentColor" /></span><span className="mini-video-label">9:16 VERTICAL</span></div>
            <div className="floating-preview-copy"><span className="tiny-green-dot" /><div><strong>هوية واحدة، محتوى متناسق</strong><small>اللغة · الصوت · الصورة · المونتاج</small></div></div>
          </div>
        </aside>
      </div>
      <footer className="onboarding-foot"><span>© CUTO Studio</span><span>خصوصيتك أولويتنا</span><span>مصمم لصنّاع المحتوى</span></footer>
    </main>
  )
}

function Sidebar({ activeView, setActiveView, channels, activeChannel, onSwitchChannel, onAddChannel, onSignOut, user, mobileOpen, setMobileOpen }) {
  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'projects', label: 'مشروعات الفيديو', icon: FolderKanban, count: null },
    { id: 'channels', label: 'قنواتي', icon: Layers3 },
    { id: 'settings', label: 'الإعدادات', icon: Settings2 },
  ]
  return (
    <>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة" />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Brand />
          <span className="studio-pill"><span className="tiny-green-dot" /> STUDIO</span>
        </div>
        <div className="sidebar-label">مساحة العمل</div>
        <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
          {navItems.map(item => {
            const Icon = item.icon
            return <button key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => { setActiveView(item.id); setMobileOpen(false) }}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'projects' && <span className="nav-count">{channels.length ? '↗' : '—'}</span>}</button>
          })}
        </nav>
        <div className="sidebar-divider" />
        <div className="channel-block">
          <div className="sidebar-label channel-label">القناة الحالية <button className="icon-button micro" aria-label="خيارات القناة"><MoreHorizontal size={17} /></button></div>
          {activeChannel ? (
            <div className="channel-switcher">
              <div className="channel-avatar">{(activeChannel.name || 'C').slice(0, 1)}</div>
              <div className="channel-switcher-copy"><strong>{activeChannel.name}</strong><small dir="ltr">@{(activeChannel.username || 'yourchannel').replace(/^@/, '')}</small></div>
              <button className="icon-button channel-drop" aria-label="تبديل القناة" onClick={() => channels.length > 1 && onSwitchChannel(channels.find(ch => ch.id !== activeChannel.id)?.id)}><ChevronDown size={15} /></button>
            </div>
          ) : (
            <div className="empty-channel-small"><span>لسه مفيش قناة</span></div>
          )}
          <button className="add-channel-button" onClick={onAddChannel} disabled={channels.length >= 2}><Plus size={16} /> إضافة قناة <span>{channels.length}/2</span></button>
        </div>
        <div className="sidebar-promo">
          <span className="promo-icon"><WandSparkles size={17} /></span>
          <strong>فكرتك هي البداية</strong>
          <p>اكتب فكرة بسيطة، وسيب تجهيز السيناريو لقناتك.</p>
          <button onClick={() => { setActiveView('home'); setMobileOpen(false) }}>ابدأ مشروعًا <ArrowUpLeft size={14} /></button>
        </div>
        <div className="sidebar-bottom">
          <div className="user-profile">
            <div className="user-avatar"><UserRound size={18} /></div>
            <div className="user-copy"><strong>{user?.email ? user.email.split('@')[0] : 'مساحة تجريبية'}</strong><small>{user?.email || 'Preview workspace'}</small></div>
            {user && <button className="icon-button" onClick={onSignOut} title="تسجيل الخروج" aria-label="تسجيل الخروج"><LogOut size={16} /></button>}
          </div>
          <div className="sidebar-build"><span className="tiny-green-dot" /> {supabaseConfigured ? 'اتصال قاعدة البيانات مهيّأ' : 'وضع المعاينة المحلي'}</div>
        </div>
      </aside>
    </>
  )
}

function Topbar({ activeView, activeChannel, setMobileOpen, user, onSignOut }) {
  const headings = {
    home: ['مساحة الإبداع', 'خلّي فكرتك تتحول لخطة فيديو متكاملة.'],
    projects: ['مشروعات الفيديو', 'كل أفكارك وخطط الإنتاج في مكان واحد.'],
    channels: ['قنواتك', 'هوية واضحة لكل قناة، من أول برومبت لآخر لقطة.'],
    settings: ['الإعدادات', 'تحكّم في تفضيلات الاستوديو وتجربة الإنتاج.'],
  }
  const header = headings[activeView] || headings.home
  return (
    <header className="topbar">
      <div className="topbar-start">
        <button className="icon-button menu-trigger" onClick={() => setMobileOpen(true)} aria-label="فتح القائمة"><Menu size={20} /></button>
        <div><span className="breadcrumb">CUTO <ChevronLeft size={12} /> {header[0]}</span><h1>{header[0]}</h1><p>{header[1]}</p></div>
      </div>
      <div className="topbar-actions">
        <div className={`connection-pill ${supabaseConfigured ? 'connected' : 'preview'}`}><span className="tiny-green-dot" />{supabaseConfigured ? 'مساحة مؤمنة' : 'معاينة'}</div>
        <button className="icon-button notification-button" aria-label="الإشعارات"><Bell size={18} /><i /></button>
        <div className="topbar-divider" />
        <button className="topbar-account" onClick={user && onSignOut ? onSignOut : undefined} title={user ? 'تسجيل الخروج' : 'وضع المعاينة'}><span className="topbar-avatar"><UserRound size={17} /></span><span className="account-meta"><strong>{activeChannel?.name || 'أهلًا بك'}</strong><small>{user?.email ? 'حسابك' : 'مساحة العمل'}</small></span><ChevronDown size={14} /></button>
      </div>
    </header>
  )
}

function ProgressRing({ value = 0 }) {
  const circumference = 2 * Math.PI * 15
  return <span className="progress-ring"><svg viewBox="0 0 36 36" aria-label={`${value}%`}><circle className="ring-bg" cx="18" cy="18" r="15" /><circle className="ring-value" cx="18" cy="18" r="15" strokeDasharray={circumference} strokeDashoffset={circumference - circumference * value / 100} /></svg><span>{value}%</span></span>
}

function ProjectCard({ project, onOpen }) {
  const isCompleted = project.status === 'completed'
  const isRunning = ['queued', 'processing'].includes(project.status)
  const statusLabel = isCompleted ? 'مكتمل' : project.status === 'failed' ? 'تعذّر' : project.status === 'queued' ? 'في الانتظار' : project.status === 'processing' ? 'قيد التنفيذ' : project.status === 'planning' ? 'تجهيز الخطة' : 'مسودة'
  const progress = Math.max(0, Math.min(100, Number(project.progress) || 0))
  return (
    <button className="project-card" onClick={() => onOpen(project)}>
      <div className="project-card-image" style={{ backgroundImage: `linear-gradient(180deg, transparent, rgba(4,7,9,.68)), url("${project.thumbnail_url || HERO_IMAGE}")` }}>
        <span className={`project-status ${isCompleted ? 'complete' : ''} ${isRunning ? 'running' : ''}`}>{statusLabel}</span>
        <span className="project-format">9:16</span>
        <span className="project-image-title">{project.title || project.idea}</span>
      </div>
      {isRunning && <div className="project-progress" aria-label={`تقدم حقيقي: ${progress}%`}><span style={{ width: `${progress}%` }} /></div>}
      <div className="project-card-body"><span className="project-meta"><Clock3 size={13} /> {new Date(project.created_at || Date.now()).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</span><span className="project-open">فتح المشروع <ArrowUpLeft size={14} /></span></div>
    </button>
  )
}

function ProjectModal({ project, onClose, onDownload, onGenerateNarration, narrationLoading, onCopyCaption, onGenerateVideo, videoGenerationLoading }) {
  if (!project) return null
  const plan = project.recipe_plan || {}
  const publishingPack = plan.publishing_pack || {}
  const platformCaptions = Array.isArray(publishingPack.platforms) ? publishingPack.platforms : []
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <section className="project-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
        <div className="modal-header"><span className="modal-kicker"><Clapperboard size={15} /> تفاصيل المشروع</span><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={19} /></button></div>
        <div className="modal-hero-image" style={{ backgroundImage: `linear-gradient(0deg, rgba(8,11,16,.92), rgba(8,11,16,.05)), url("${project.thumbnail_url || HERO_IMAGE}")` }}><span className="ratio-badge">VERTICAL · 9:16</span><h2 id="project-modal-title">{project.title || project.idea}</h2></div>
        <div className="modal-content">
          <div className="modal-state-line"><span className="state-indicator" /> <span>{project.stage || 'مسودة محفوظة'}</span><span className="muted">{project.duration_seconds || 45} ثانية مستهدفة</span></div>
          {['queued', 'processing'].includes(project.status) && <div className="render-progress-panel"><div><strong>{project.stage || (project.status === 'queued' ? 'في قائمة الانتظار' : 'جارٍ تنفيذ مهمة إنتاج')}</strong><span>{Math.max(0, Math.min(100, Number(project.progress) || 0))}%</span></div><div className="render-progress-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(project.progress) || 0))}%` }} /></div><small>هذا التقدم يأتي من حالة المهمة المسجلة في الخادم؛ لا يتم تحريكه شكليًا في الواجهة.</small></div>}
          {project.idea && <div className="detail-section"><h3>الفكرة الأصلية</h3><p>{project.idea}</p></div>}
          {plan.hook && <div className="detail-section"><h3>الافتتاحية المقترحة</h3><p className="hook-quote">«{plan.hook}»</p></div>}
          {Array.isArray(plan.steps) && plan.steps.length > 0 && <div className="detail-section"><h3>تسلسل المشاهد</h3><div className="scene-list">{plan.steps.map((step, index) => <div className="scene-row" key={step.title || index}><span className="scene-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{step.title || step.name}</strong><p>{step.detail || step.description}</p></div><small>{step.seconds ? `${step.seconds}ث` : ''}</small></div>)}</div></div>}
          {project.prompt_pack && <div className="detail-section"><h3>برومبتات القناة</h3>{Object.entries(project.prompt_pack).map(([key, value]) => <div className="prompt-line" key={key}><strong>{({identity:'الهوية',script:'السيناريو',voice:'الصوت',visuals:'المشاهد',edit:'المونتاج'})[key] || key}</strong><p>{value}</p></div>)}</div>}
          {(publishingPack.primary_caption || platformCaptions.length > 0) && <div className="detail-section caption-package">
            <div className="caption-package-heading"><div><h3>كابتشن النشر — جاهز لكل منصة</h3><p>نسخ مخصص للمنصة، مع دعوة للتفاعل وهاشتاجات مرتبطة بالوصفة، باللغة واللهجة المحددتين للقناة.</p></div><span className="caption-package-mark"><Hash size={15} /> SOCIAL</span></div>
            {publishingPack.primary_caption && <div className="caption-primary"><strong>الكابتشن الأساسي</strong><p>{publishingPack.primary_caption}</p><button type="button" className="subtle-button" onClick={() => onCopyCaption?.({ id: 'primary', name: 'الكابتشن الأساسي', caption: publishingPack.primary_caption, hashtags: [] })}><Copy size={14} /> نسخ الكابتشن الأساسي</button></div>}
            <div className="caption-platform-grid">{platformCaptions.map(item => <article className="caption-platform-card" key={item.id || item.name}>
              <div className="caption-platform-header"><strong>{item.name || item.platform}</strong><button type="button" className="subtle-button" onClick={() => onCopyCaption?.(item)}><Copy size={13} /> نسخ</button></div>
              {item.title && <p className="caption-platform-title">{item.title}</p>}
              {item.caption && <p className="caption-platform-text">{item.caption}</p>}
              {item.cta && <p className="caption-platform-cta">{item.cta}</p>}
              {Array.isArray(item.hashtags) && item.hashtags.length > 0 && <p className="caption-hashtags">{item.hashtags.join(' ')}</p>}
            </article>)}</div>
            {publishingPack.pinned_comment && <div className="caption-pinned-comment"><strong>تعليق مقترح للتثبيت</strong><p>{publishingPack.pinned_comment}</p><button type="button" className="subtle-button" onClick={() => onCopyCaption?.({ id: 'pinned', name: 'التعليق المثبت', caption: publishingPack.pinned_comment, hashtags: [] })}><Copy size={13} /> نسخ التعليق</button></div>}
            {Array.isArray(publishingPack.seo_keywords) && publishingPack.seo_keywords.length > 0 && <div className="caption-keywords"><strong>كلمات مفتاحية مقترحة</strong><p>{publishingPack.seo_keywords.join(' · ')}</p></div>}
          </div>}
          {plan.voice_script && <div className="narration-panel">
            <div className="narration-copy"><span className="narration-icon"><AudioLines size={17} /></span><div><strong>التعليق الصوتي</strong><p>{project.voice_audio_url ? 'ملف الصوت متاح للاستماع عبر رابط خاص مؤقت.' : project.voice_storage_path ? 'تم تخزين التعليق الصوتي بشكل خاص. يمكنك استرجاع رابط للاستماع.' : 'ولّد التعليق باللهجة والاختيار الصوتي الافتراضي للقناة.'}</p></div></div>
            <button className="secondary-button narration-generate" onClick={() => onGenerateNarration?.(project)} disabled={narrationLoading}>
              {narrationLoading ? <LoaderCircle className="spin" size={15} /> : <AudioLines size={15} />}
              {narrationLoading ? 'جارٍ تجهيز التعليق…' : project.voice_audio_url || project.voice_storage_path ? 'إنشاء / استرجاع التعليق' : 'إنشاء التعليق الصوتي'}
            </button>
            {project.voice_audio_url && <audio className="voice-audio-preview" controls preload="none" src={project.voice_audio_url}>متصفحك لا يدعم تشغيل الصوت.</audio>}
          </div>}
          {!project.is_local_preview && !project.video_storage_path && Array.isArray(plan.shot_list) && plan.shot_list.length > 0 && <div className="video-production-actions">
            <button className="primary-button full-width" type="button" onClick={() => onGenerateVideo?.(project)} disabled={videoGenerationLoading || ['queued', 'processing'].includes(project.status)}>
              {videoGenerationLoading || ['queued', 'processing'].includes(project.status) ? <LoaderCircle className="spin" size={17} /> : <Clapperboard size={17} />}
              {videoGenerationLoading ? 'جارٍ تجهيز الصوت وإرسال المشاهد…' : ['queued', 'processing'].includes(project.status) ? 'جاري إنتاج الفيديو...' : project.status === 'failed' ? 'إعادة محاولة إنتاج الفيديو' : 'ولّد الفيديو الكامل بالذكاء الاصطناعي'}
            </button>
            <p>Gemini يخطط، وModal يشغّل موديل فيديو مولّد، وصوت Gemini AI Studio يُدمج مع الترجمة واسم القناة. لا تُستخدم لقطات جاهزة.</p>
          </div>}
          <div className="render-notice"><Film size={18} /><div><strong>{project.video_storage_path || project.video_url ? 'الفيديو جاهز للتنزيل' : 'خطة الإنتاج لا تعني أن ملف الفيديو قد أُنتج'}</strong><p>{project.video_storage_path || project.video_url ? 'الملف النهائي محفوظ في مساحة CUTO الخاصة.' : (plan.note || 'أنشئ خطة الفيديو أولًا؛ لا يعرض CUTO اكتمالًا وهميًا قبل وجود ملف MP4 فعلي.')}</p></div></div>
          <div className="modal-actions">{project.video_url && <a className="primary-button" href={project.video_url} target="_blank" rel="noreferrer"><Download size={16} /> فتح الفيديو</a>}<button className="secondary-button" onClick={() => onDownload(project)}><Download size={16} /> تنزيل تفاصيل المشروع</button><button className="ghost-button" onClick={onClose}>إغلاق</button></div>
        </div>
      </section>
    </div>
  )
}

function EmptyProjects({ onCreate }) {
  return <div className="empty-state"><span className="empty-icon"><Film size={27} /></span><h3>لسه مفيش مشروعات</h3><p>كل فيديو بيبدأ بفكرة. اكتب أول فكرة علشان نجهّز خطة إنتاج لقناتك.</p><button className="primary-button" onClick={onCreate}><Plus size={17} /> ابدأ بفكرة جديدة</button></div>
}

function App() {
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(!supabaseConfigured)
  const [authMode, setAuthMode] = useState('signin')
  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [booting, setBooting] = useState(supabaseConfigured)
  const [activeView, setActiveView] = useState('home')
  const [channels, setChannels] = useState(() => supabaseConfigured ? [] : readLocal('cuto.channels', []))
  const [projects, setProjects] = useState(() => supabaseConfigured ? [] : readLocal('cuto.projects', []))
  const [activeChannelId, setActiveChannelId] = useState(() => readLocal('cuto.activeChannelId', null))
  const [onboardingOpen, setOnboardingOpen] = useState(() => !supabaseConfigured && !readLocal('cuto.channels', []).length)
  const [onboardingAdding, setOnboardingAdding] = useState(false)
  const [setupStep, setSetupStep] = useState(1)
  const [setup, setSetup] = useState(defaultSetup)
  const [editingChannelId, setEditingChannelId] = useState(null)
  const [setupSaving, setSetupSaving] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [idea, setIdea] = useState('')
  const [ideaDuration, setIdeaDuration] = useState('45')
  const [generating, setGenerating] = useState(false)
  const [generationPhase, setGenerationPhase] = useState('')
  const [voicePreviewUrl, setVoicePreviewUrl] = useState(null)
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false)
  const [narrationLoading, setNarrationLoading] = useState(false)
  const [videoGenerationProjectId, setVideoGenerationProjectId] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const [toast, setToast] = useState(null)

  const activeChannel = useMemo(() => channels.find(channel => channel.id === activeChannelId) || channels[0] || null, [channels, activeChannelId])
  const user = session?.user || null

  useEffect(() => {
    if (activeChannel?.default_duration_seconds) setIdeaDuration(String(activeChannel.default_duration_seconds))
  }, [activeChannel?.id, activeChannel?.default_duration_seconds])

  const notify = (message, type = 'success') => setToast({ message, type })

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(null), 4800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setBooting(false)
      return undefined
    }
    let alive = true
    const hydrate = async currentUser => {
      if (!currentUser) {
        if (alive) { setChannels([]); setProjects([]); setBooting(false); setOnboardingOpen(false) }
        return
      }
      setBooting(true)
      const [channelResult, projectResult] = await Promise.all([
        supabase.from('channels').select('*').order('created_at', { ascending: true }),
        supabase.from('video_projects').select('*').order('created_at', { ascending: false }).limit(40),
      ])
      if (!alive) return
      if (channelResult.error || projectResult.error) {
        notify('تعذّر تحميل مساحة العمل. تأكد من تطبيق ترحيل قاعدة البيانات وسياسات RLS.', 'error')
      }
      const loadedChannels = channelResult.data || []
      setChannels(loadedChannels)
      setProjects(projectResult.data || [])
      if (loadedChannels.length) {
        const preferred = loadedChannels.find(channel => channel.id === activeChannelId) || loadedChannels[0]
        setActiveChannelId(preferred.id)
        setOnboardingOpen(false)
      } else {
        setSetup(defaultSetup)
        setSetupStep(1)
        setOnboardingOpen(true)
        setOnboardingAdding(false)
      }
      setBooting(false)
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) notify('تعذّر التحقق من جلسة الدخول.', 'error')
      setSession(data?.session || null)
      setAuthChecked(true)
      hydrate(data?.session?.user || null)
    }).catch(() => { if (alive) { setAuthChecked(true); setBooting(false) } })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!alive) return
      setSession(currentSession)
      hydrate(currentSession?.user || null)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !user?.id) return undefined
    const subscription = supabase
      .channel(`cuto-project-updates-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_projects', filter: `user_id=eq.${user.id}` }, payload => {
        if (payload.eventType === 'DELETE') {
          setProjects(current => current.filter(project => project.id !== payload.old.id))
          return
        }
        const project = payload.new
        if (!project?.id) return
        setProjects(current => current.some(item => item.id === project.id)
          ? current.map(item => item.id === project.id ? { ...item, ...project } : item)
          : [project, ...current])
      })
      .subscribe()
    return () => { supabase.removeChannel(subscription) }
  }, [user?.id])

  const activeVideoProjectKey = projects
    .filter(project => ['queued', 'processing'].includes(project.status) && !project.video_storage_path)
    .map(project => project.id)
    .join('|')

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !user?.id || !activeVideoProjectKey) return undefined
    let alive = true
    let timeout = null
    const poll = async () => {
      const projectIds = activeVideoProjectKey.split('|').filter(Boolean)
      for (const projectId of projectIds) {
        if (!alive) return
        try {
          const { data, error } = await supabase.functions.invoke('modal-render-status', { body: { project_id: projectId } })
          if (error) {
            console.warn('CUTO video status polling failed:', error.message)
            continue
          }
          if (!data) continue
          const patch = data.project || {
            id: projectId,
            status: data.status === 'completed' ? 'completed' : data.status === 'failed' ? 'failed' : 'processing',
            progress: Number.isFinite(Number(data.progress)) ? Number(data.progress) : undefined,
            stage: typeof data.stage === 'string' ? data.stage : undefined,
            error_message: data.error || null,
          }
          if (!alive) return
          setProjects(current => current.map(item => item.id === projectId ? { ...item, ...patch } : item))
          setSelectedProject(current => current?.id === projectId ? { ...current, ...patch } : current)
          if (data.status === 'completed') notify('اكتمل الفيديو وحُفظ داخل مساحة CUTO الخاصة. يمكنك تنزيل MP4 الآن.')
          if (data.status === 'failed' && data.error) notify('توقّف إنتاج الفيديو: ' + String(data.error).slice(0, 160), 'error')
        } catch (error) {
          console.warn('CUTO video status poll exception:', error?.message || error)
        }
      }
      if (alive) timeout = window.setTimeout(poll, 8000)
    }
    timeout = window.setTimeout(poll, 1500)
    return () => {
      alive = false
      if (timeout) window.clearTimeout(timeout)
    }
  }, [user?.id, activeVideoProjectKey])

  useEffect(() => {
    if (!supabaseConfigured) {
      writeLocal('cuto.channels', channels)
      writeLocal('cuto.projects', projects)
      if (activeChannelId) writeLocal('cuto.activeChannelId', activeChannelId)
    }
  }, [channels, projects, activeChannelId])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    if (!supabase) return
    setAuthLoading(true)
    setAuthMessage('')
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: credentials.email.trim(), password: credentials.password, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error
        if (data.session) {
          setSession(data.session)
          notify('تم إنشاء الحساب بنجاح.')
        } else {
          setAuthMessage('تم إنشاء الحساب. افتح رسالة تأكيد البريد الإلكتروني، ثم ارجع وسجّل الدخول.')
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: credentials.email.trim(), password: credentials.password })
        if (error) throw error
        setSession(data.session)
        notify('تم تسجيل الدخول بنجاح.')
      }
    } catch (error) {
      setAuthMessage(error?.message || 'تعذّر تسجيل الدخول. راجع بياناتك وحاول مجددًا.')
    } finally { setAuthLoading(false) }
  }

  async function handleSignOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) notify('لم نتمكن من تسجيل الخروج. حاول مرة أخرى.', 'error')
    else { setSession(null); setAuthMessage(''); notify('تم تسجيل الخروج بأمان.') }
  }

  function startAddChannel() {
    if (channels.length >= 2) {
      notify('الحد الأقصى هو قناتان لكل حساب.', 'error')
      return
    }
    setEditingChannelId(null)
    setSetup({ ...defaultSetup, duration: String(activeChannel?.default_duration_seconds || 45), language: activeChannel?.language || 'ar-EG', voiceGender: activeChannel?.voice_gender || 'female', visualStyle: activeChannel?.visual_style || 'سينمائي واقعي' })
    setSetupStep(1)
    setSetupError('')
    setOnboardingAdding(true)
    setOnboardingOpen(true)
  }

  async function handleSetupSubmit() {
    if (!setup.niche.trim() || !setup.channelName.trim() || !setup.username.trim()) {
      setSetupError('كمّل اسم القناة واسم المستخدم ووصف محتواها علشان نجهّز الإعدادات.')
      setSetupStep(1)
      return
    }
    if (channels.length >= 2 && !onboardingAdding && !editingChannelId) {
      setSetupError('وصلت للحد الأقصى: قناتان لكل حساب.')
      return
    }
    setSetupSaving(true)
    setSetupError('')
    const channelPayload = {
      name: setup.channelName.trim(),
      username: setup.username.trim().replace(/^@/, ''),
      niche: setup.niche.trim(),
      audience: setup.audience.trim(),
      language: setup.language,
      voice_gender: setup.voiceGender,
      visual_style: setup.visualStyle,
      captions_enabled: setup.captions,
      watermark_enabled: setup.watermark,
      default_duration_seconds: Number(setup.duration || 45),
      prompt_pack: {},
    }
    try {
      let channel
      if (supabaseConfigured && supabase && user) {
        if (editingChannelId) {
          const { data, error } = await supabase.from('channels')
            .update(channelPayload).eq('id', editingChannelId).eq('user_id', user.id).select().single()
          if (error) throw error
          channel = data
          setChannels(current => current.map(item => item.id === channel.id ? channel : item))
          setActiveChannelId(channel.id)
          setOnboardingOpen(false)
          setOnboardingAdding(false)
          setActiveView('settings')
          notify('تم حفظ إعدادات القناة. جارٍ تحديث حزمة البرومبتات.')
        } else {
          const slot = [1, 2].find(candidate => !channels.some(existing => Number(existing.slot) === candidate))
          if (!slot) throw new Error('وصلت للحد الأقصى: قناتان لكل حساب.')
          const { data, error } = await supabase.from('channels').insert({ ...channelPayload, user_id: user.id, slot }).select().single()
          if (error) throw error
          channel = data
          setChannels(current => [...current, channel])
          setActiveChannelId(channel.id)
          setOnboardingOpen(false)
          setOnboardingAdding(false)
          setActiveView('home')
          notify('تم حفظ القناة. جارٍ تجهيز حزمة البرومبتات الخاصة بها.')
        }
        const { data: directorData, error: directorError } = await supabase.functions.invoke('channel-director', { body: { channel_id: channel.id } })
        if (directorError) {
          notify('تم حفظ القناة، لكن إعداد البرومبتات يحتاج إلى نشر channel-director وضبط GEMINI_API_KEY.', 'error')
        } else if (directorData?.channel) {
          channel = directorData.channel
          setChannels(current => current.map(item => item.id === channel.id ? channel : item))
          notify('تم تجهيز هوية القناة وحزمة البرومبتات.')
        }
      } else if (editingChannelId) {
        const oldChannel = channels.find(item => item.id === editingChannelId)
        if (!oldChannel) throw new Error('القناة المطلوبة غير موجودة في مساحة المعاينة.')
        channel = { ...oldChannel, ...channelPayload, prompt_pack: createPromptPack({ ...oldChannel, ...channelPayload }), updated_at: new Date().toISOString() }
        setChannels(current => current.map(item => item.id === channel.id ? channel : item))
        setActiveChannelId(channel.id)
        setOnboardingOpen(false)
        setOnboardingAdding(false)
        setActiveView('settings')
        notify('تم تحديث إعدادات القناة في المعاينة المحلية.')
      } else {
        const id = makeId()
        channel = {
          id,
          ...channelPayload,
          user_id: 'local-preview',
          slot: channels.length + 1,
          prompt_pack: createPromptPack({ id, ...channelPayload }),
          created_at: new Date().toISOString(),
          is_local_preview: true,
        }
        setChannels(current => [...current, channel])
        setActiveChannelId(id)
        setOnboardingOpen(false)
        setOnboardingAdding(false)
        setActiveView('home')
        notify('تم حفظ إعدادات المعاينة على هذا المتصفح فقط. اربط Supabase لحفظها في حساب فعلي.')
      }
      setSetup(defaultSetup)
      setEditingChannelId(null)
    } catch (error) {
      const duplicate = /duplicate|unique|slot|channels_owner_slot/i.test(error?.message || '')
      setSetupError(duplicate ? 'اسم المستخدم أو مساحة القناة مستخدمة بالفعل. جرّب اسمًا آخر.' : error?.message || 'تعذّر حفظ الإعدادات. تأكد من تطبيق قاعدة البيانات.')
      notify('لم يتم حفظ القناة.', 'error')
    } finally { setSetupSaving(false) }
  }

  async function handleVoicePreview() {
    setVoicePreviewUrl(null)
    if (!supabaseConfigured || !supabase || !user) {
      notify('معاينة الصوت الحقيقية تتطلب ربط مشروع Supabase منفصل لـ CUTO، ونشر voice-preview وضبط GEMINI_API_KEY في أسرار الخادم.', 'error')
      return
    }
    setVoicePreviewLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('voice-preview', {
        body: { voice_gender: setup.voiceGender, language: setup.language },
      })
      if (error) throw error
      if (!data?.audio_data_url) throw new Error(data?.message || 'خدمة الصوت لم تُرجع ملف معاينة.')
      setVoicePreviewUrl(data.audio_data_url)
      notify('تم تجهيز عيّنة الصوت. اضغط تشغيل للاستماع.')
    } catch (error) {
      notify(error?.message || 'تعذّر تجهيز عيّنة الصوت. تأكد من نشر الوظيفة وإعداد مفتاح الصوت.', 'error')
    } finally {
      setVoicePreviewLoading(false)
    }
  }

  async function handleGenerateNarration(project) {
    if (!supabaseConfigured || !supabase || !user || project?.is_local_preview) {
      notify('إنشاء الصوت يتطلب مشروع Supabase متصلًا ووظيفة generate-narration مع GEMINI_API_KEY. لم يُنشأ صوت وهمي.', 'error')
      return
    }
    setNarrationLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-narration', { body: { project_id: project.id } })
      if (error) throw error
      if (!data?.project) throw new Error(data?.message || 'لم تُرجع الخدمة ملف التعليق الصوتي.')
      const updated = data.project
      setProjects(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))
      setSelectedProject(current => current?.id === updated.id ? { ...current, ...updated } : current)
      notify('تم تجهيز التعليق الصوتي وحفظه في تخزين خاص. لم يُنتج ملف MP4 حتى الآن.')
    } catch (error) {
      notify(error?.message || 'تعذّر توليد التعليق الصوتي. راجع إعداد خدمة Gemini وتخزين الملفات.', 'error')
    } finally {
      setNarrationLoading(false)
    }
  }

  async function openProject(project) {
    if (!project) return
    let nextProject = project
    if (project.video_storage_path && supabaseConfigured && supabase && user) {
      try {
        const { data, error } = await supabase.storage.from('cuto-assets').createSignedUrl(project.video_storage_path, 3600)
        if (!error && data?.signedUrl) nextProject = { ...project, video_url: data.signedUrl }
      } catch {
        // Keep project details available even if renewing the temporary video URL fails.
      }
    }
    setSelectedProject(nextProject)
  }

  async function handleGenerateVideo(project) {
    if (!supabaseConfigured || !supabase || !user || !project || project.is_local_preview) {
      notify('إنتاج MP4 يحتاج حساب Supabase متصلًا ونشر وظائف CUTO. معاينة المتصفح وحدها لا تولّد فيديو حقيقيًا.', 'error')
      return
    }
    if (!project.recipe_plan?.shot_list?.length || !project.recipe_plan?.voice_script) {
      notify('أعد تجهيز خطة Gemini أولًا حتى تتوفر المشاهد والسيناريو الصوتي.', 'error')
      return
    }
    if (project.video_storage_path) {
      await openProject(project)
      return
    }

    setVideoGenerationProjectId(project.id)
    try {
      let currentProject = project
      if (!currentProject.voice_storage_path) {
        setNarrationLoading(true)
        const { data: narrationData, error: narrationError } = await supabase.functions.invoke('generate-narration', {
          body: { project_id: currentProject.id },
        })
        setNarrationLoading(false)
        if (narrationError) throw narrationError
        if (!narrationData?.project?.voice_storage_path) {
          throw new Error(narrationData?.message || 'تعذّر تجهيز صوت Gemini AI Studio.')
        }
        currentProject = narrationData.project
        setProjects(current => current.map(item => item.id === currentProject.id ? { ...item, ...currentProject } : item))
        setSelectedProject(current => current?.id === currentProject.id ? { ...current, ...currentProject } : current)
      }

      const { data, error } = await supabase.functions.invoke('modal-render-start', {
        body: { project_id: currentProject.id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.message || data.error)
      const { data: freshProject, error: refreshError } = await supabase
        .from('video_projects').select('*').eq('id', currentProject.id).eq('user_id', user.id).single()
      if (refreshError) throw refreshError
      if (freshProject) {
        setProjects(current => current.map(item => item.id === freshProject.id ? { ...item, ...freshProject } : item))
        setSelectedProject(current => current?.id === freshProject.id ? { ...current, ...freshProject } : current)
      }
      notify('بدأ CUTO توليد المقاطع الأصلية على Modal باستخدام LTX-2.5، وسيظهر التقدم من حالات التوليد والرندر الفعلية.')
    } catch (error) {
      setNarrationLoading(false)
      notify(error?.message || 'تعذّر بدء إنتاج الفيديو. تأكد من إعداد أسرار Gemini والرندر ونشر وظائف CUTO.', 'error')
    } finally {
      setVideoGenerationProjectId(null)
    }
  }

  async function handleGenerate(event) {
    event.preventDefault()
    if (!idea.trim()) { notify('اكتب وصف الفكرة الأول.', 'error'); return }
    if (!activeChannel) { setSetup(defaultSetup); setOnboardingOpen(true); setSetupStep(1); return }
    setGenerating(true)
    setGenerationPhase('saving')
    const originalIdea = idea.trim()
    try {
      if (supabaseConfigured && supabase && user) {
        const { data: project, error } = await supabase.from('video_projects').insert({
          user_id: user.id,
          channel_id: activeChannel.id,
          title: originalIdea.slice(0, 100),
          idea: originalIdea,
          status: 'draft',
          progress: 0,
          stage: 'تم حفظ الفكرة؛ بانتظار تجهيز خطة الإنتاج',
          aspect_ratio: '9:16',
          duration_seconds: Number(ideaDuration),
        }).select().single()
        if (error) throw error
        setProjects(current => [project, ...current])
        setIdea('')
        setActiveView('projects')
        setSelectedProject(project)
        setGenerationPhase('planning')
        const { data, error: directorError } = await supabase.functions.invoke('recipe-director', { body: { project_id: project.id, channel_id: activeChannel.id, idea: originalIdea, duration_seconds: Number(ideaDuration) } })
        if (directorError) {
          notify('تم حفظ المشروع، لكن لم تُنتج خطة AI. انشر recipe-director واضبط مفتاح Gemini.', 'error')
        } else if (data?.project) {
          setGenerationPhase('saving-result')
          setProjects(current => current.map(p => p.id === project.id ? data.project : p))
          setSelectedProject(data.project)
          notify('اكتمل إعداد السيناريو وقائمة المشاهد. إنتاج MP4 يحتاج مزود فيديو ومونتاج.')
        } else {
          notify('تم حفظ الفكرة في مشروعاتك.')
        }
      } else {
        setGenerationPhase('preview')
        const project = {
          id: makeId(), user_id: 'local-preview', channel_id: activeChannel.id,
          title: originalIdea.slice(0, 100), idea: originalIdea, status: 'draft',
          progress: 0, stage: 'معاينة محلية — لا يوجد فيديو مُنتَج',
          aspect_ratio: '9:16', duration_seconds: Number(ideaDuration),
          recipe_plan: buildPreviewPlan(originalIdea, activeChannel, ideaDuration),
          prompt_pack: activeChannel.prompt_pack || createPromptPack(activeChannel),
          created_at: new Date().toISOString(),
          is_local_preview: true,
        }
        setProjects(current => [project, ...current])
        setIdea('')
        setActiveView('projects')
        setSelectedProject(project)
        notify('اتحفظت معاينة المشروع محليًا. لم يتم إنشاء فيديو فعلي.')
      }
    } catch (error) {
      notify(error?.message || 'تعذّر حفظ المشروع. حاول مرة أخرى.', 'error')
    } finally { setGenerating(false); setGenerationPhase('') }
  }

  async function handleCopyCaption(item) {
    const hashtags = Array.isArray(item?.hashtags) ? item.hashtags.join(' ') : ''
    const captionText = [
      item?.title ? item.title : '',
      item?.caption || item?.description || '',
      item?.cta && !(item.caption || '').includes(item.cta) ? item.cta : '',
      hashtags,
    ].filter(Boolean).join('\n\n').trim()
    if (!captionText) { notify('الكابتشن فارغ.', 'error'); return }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(captionText)
      } else {
        const field = document.createElement('textarea')
        field.value = captionText
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        const copied = document.execCommand('copy')
        field.remove()
        if (!copied) throw new Error('clipboard_unavailable')
      }
      notify(`تم نسخ ${item?.name || 'الكابتشن'} جاهزًا للنشر.`)
    } catch {
      notify('لم يسمح المتصفح بالنسخ. حدّد النص وانسخه يدويًا.', 'error')
    }
  }

  function downloadProject(project) {
    try {
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `cuto-${(project.title || 'project').replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 48)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch { notify('تعذّر تنزيل تفاصيل المشروع.', 'error') }
  }

  const filteredProjects = useMemo(() => projects.filter(project => {
    const matchesChannel = !activeChannel || project.channel_id === activeChannel.id
    const needle = searchTerm.trim().toLowerCase()
    return matchesChannel && (!needle || `${project.title || ''} ${project.idea || ''}`.toLowerCase().includes(needle))
  }), [projects, activeChannel, searchTerm])

  if (booting || (supabaseConfigured && !authChecked)) {
    return <main className="loading-screen"><Brand /><span className="loading-spinner"><LoaderCircle size={25} /></span><p>بنجهّز مساحة العمل بأمان…</p></main>
  }

  if (supabaseConfigured && !session) {
    return <><AuthScreen mode={authMode} setMode={mode => { setAuthMode(mode); setAuthMessage('') }} onSubmit={handleAuthSubmit} loading={authLoading} message={authMessage} credentials={credentials} setCredentials={setCredentials} /><Toast toast={toast} onClose={() => setToast(null)} /></>
  }

  if (onboardingOpen) {
    return <><Onboarding setup={setup} setSetup={setSetup} step={setupStep} setStep={setSetupStep} onSubmit={handleSetupSubmit} onClose={() => { setOnboardingOpen(false); setOnboardingAdding(false); setEditingChannelId(null); setSetupError('') }} loading={setupSaving} adding={onboardingAdding} editing={Boolean(editingChannelId)} error={setupError} onPreviewVoice={handleVoicePreview} voicePreviewUrl={voicePreviewUrl} voicePreviewLoading={voicePreviewLoading} clearVoicePreview={() => setVoicePreviewUrl(null)} /><Toast toast={toast} onClose={() => setToast(null)} /></>
  }

  return (
    <main className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} channels={channels} activeChannel={activeChannel} onSwitchChannel={id => { if (id) setActiveChannelId(id) }} onAddChannel={startAddChannel} onSignOut={handleSignOut} user={user} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <section className="workspace">
        <Topbar activeView={activeView} activeChannel={activeChannel} setMobileOpen={setMobileOpen} user={user} onSignOut={handleSignOut} />
        <div className="workspace-body">
          {generating && <section className="job-progress glass-panel" role="status" aria-live="polite">
            <div className="job-progress-heading"><span className="job-progress-icon"><LoaderCircle size={18} className="spin" /></span><div><strong>{generationPhase === 'saving' ? 'جارٍ حفظ مشروعك' : generationPhase === 'planning' ? 'الذكاء الاصطناعي يجهّز خطة الإنتاج' : generationPhase === 'saving-result' ? 'جارٍ حفظ السيناريو وقائمة المشاهد' : 'جارٍ تجهيز معاينة محلية'}</strong><p>{generationPhase === 'planning' ? 'ننتظر استجابة خدمة التخطيط المتصلة. هذه المرحلة تنشئ خطة، وليست ملف فيديو نهائيًا.' : generationPhase === 'saving' ? 'نحفظ الفكرة ونربطها بالقناة النشطة.' : generationPhase === 'saving-result' ? 'وصلت الخطة ونجري تحديث بيانات المشروع.' : 'وضع المعاينة لا يستدعي خدمات ذكاء اصطناعي أو تصيير فيديو.'}</p></div><span className="job-live-pill">{generationPhase === 'planning' ? 'AI PLAN' : 'WORKING'}</span></div>
            <div className="job-progress-track"><span className={generationPhase === 'planning' ? 'job-progress-indeterminate' : 'job-progress-milestone'} /></div>
            <div className="job-progress-steps"><span className={['planning','saving-result'].includes(generationPhase) ? 'done' : 'active'}><i>{['planning','saving-result'].includes(generationPhase) ? '✓' : '1'}</i> حفظ الفكرة</span><span className={generationPhase === 'saving-result' ? 'done' : generationPhase === 'planning' ? 'active' : '' }><i>{generationPhase === 'saving-result' ? '✓' : '2'}</i> بناء الخطة</span><span className={generationPhase === 'saving-result' ? 'active' : '' }><i>3</i> حفظ النتيجة</span></div>
          </section>}
          {activeView === 'home' && (
            <>
              <section className="welcome-hero">
                <div className="hero-art" style={{ backgroundImage: `url("${HERO_IMAGE}")` }} />
                <div className="hero-tint" />
                <div className="hero-content">
                  <span className="hero-kicker"><span className="hero-kicker-dot" /> AI CREATOR STUDIO <span className="hero-kicker-line" /></span>
                  <h2>فكرتك تستحق<br />أن تتحوّل <em>لحكاية.</em></h2>
                  <p>اكتب الفكرة بطريقتك. CUTO يساعدك يجهّز هوية المحتوى والسيناريو وقائمة المشاهد لقناتك.</p>
                  <div className="hero-actions"><button className="hero-primary" onClick={() => document.getElementById('idea-input')?.focus()}><WandSparkles size={17} /> ابدأ بفكرة جديدة <ArrowUpLeft size={16} /></button><span className="hero-trust"><ShieldCheck size={14} /> إعدادات محفوظة لقناتك</span></div>
                </div>
                <div className="hero-floating-card">
                  <div className="floating-dish-image" style={{ backgroundImage: `url("${FOOD_IMAGE_3}")` }}><span className="dish-play"><Play size={14} fill="currentColor" /></span><span className="floating-ratio">9:16</span></div>
                  <div className="floating-card-copy"><span className="success-mark"><Check size={13} /></span><div><strong>هوية موحّدة</strong><small>صوت · لغة · أسلوب بصري</small></div></div>
                </div>
                <div className="hero-decoration hero-decoration-one" /><div className="hero-decoration hero-decoration-two" />
              </section>

              {!supabaseConfigured && <div className="preview-banner"><span className="preview-banner-icon"><CircleHelp size={17} /></span><div><strong>أنت في وضع المعاينة</strong><p>حاليًا تُحفظ البيانات في هذا المتصفح فقط. فعّل Supabase وEdge Functions لتحويل المعاينة إلى مساحة حساب حقيقية.</p></div><span className="preview-label">LOCAL PREVIEW</span></div>}

              <section className="section-block composer-block">
                <div className="section-heading"><div><span className="section-kicker">WORKFLOW / 01</span><h2>إيه الفكرة اللي في بالك؟</h2><p>ابدأ بوصف بسيط، مش محتاج تكتب برومبت تقني.</p></div><div className="channel-identity-mini"><span className="channel-avatar small">{(activeChannel?.name || 'C').slice(0, 1)}</span><span><small>القناة النشطة</small><strong>{activeChannel?.name || 'لم يتم إعداد قناة'}</strong></span><ChevronDown size={15} /></div></div>
                <form className="idea-composer glass-panel" onSubmit={handleGenerate}>
                  <div className="composer-label"><span className="composer-spark"><WandSparkles size={17} /></span><span>وصف الفكرة</span><span className="composer-ai-label">CUTO DIRECTOR</span></div>
                  <textarea id="idea-input" value={idea} onChange={e => setIdea(e.target.value)} placeholder="مثال: عايزة أعمل مكرونة بالبشاميل اقتصادية، بوش ذهبي ومقرمش، وأشرح الخطوات بطريقة سهلة…" rows="3" maxLength={1800} />
                  <div className="composer-foot"><div className="composer-hints"><span><Video size={14} /> فيديو عمودي 9:16</span><span><Mic2 size={14} /> {activeChannel?.voice_gender === 'male' ? 'صوت رجالي' : 'صوت نسائي'} افتراضي</span><span><Globe2 size={14} /> {activeChannel?.language === 'en' ? 'English' : activeChannel?.language === 'tr' ? 'Türkçe' : activeChannel?.language === 'ar' ? 'العربية الفصحى' : 'مصري'}</span></div><span className="char-count">{idea.length}/1800</span></div>
                  <div className="composer-bottom"><div className="duration-picker"><Clock3 size={15} /><span>المدة</span>{['30','45','60'].map(duration => <button type="button" key={duration} onClick={() => setIdeaDuration(duration)} className={ideaDuration === duration ? 'selected' : ''}>{duration}ث</button>)}</div><button className="primary-button generate-button" type="submit" disabled={generating || !idea.trim() || !activeChannel}>{generating ? <LoaderCircle className="spin" size={17} /> : <WandSparkles size={17} />}{generating ? 'جارٍ تجهيز المشروع…' : 'جهّز خطة الفيديو'}<ArrowUpLeft size={16} /></button></div>
                </form>
                <div className="workflow-steps"><div className="workflow-step"><span className="step-icon"><FileText size={17} /></span><span><strong>01. فهم الفكرة</strong><small>الموضوع والهدف والجمهور</small></span></div><span className="step-connector" /><div className="workflow-step"><span className="step-icon"><AudioLines size={17} /></span><span><strong>02. السيناريو والصوت</strong><small>وفق تفضيلات قناتك</small></span></div><span className="step-connector" /><div className="workflow-step"><span className="step-icon"><Clapperboard size={17} /></span><span><strong>03. خطة المشاهد</strong><small>جاهزة للمراجعة والتطوير</small></span></div></div>
              </section>

              <section className="section-block recent-block">
                <div className="section-heading compact-heading"><div><span className="section-kicker">YOUR WORKSPACE</span><h2>آخر مشروعاتك</h2></div><button className="link-button" onClick={() => setActiveView('projects')}>كل المشروعات <ArrowUpLeft size={15} /></button></div>
                {filteredProjects.length ? <div className="project-grid">{filteredProjects.slice(0, 3).map(project => <ProjectCard key={project.id} project={project} onOpen={openProject} />)}</div> : <div className="recent-empty"><span className="recent-empty-icon"><Film size={19} /></span><div><strong>أول مشروع لسه مستني فكرتك</strong><p>بعد إعداد القناة، اكتب أي فكرة في المربع فوق لبدء خطة المحتوى.</p></div><button className="subtle-button" onClick={() => document.getElementById('idea-input')?.focus()}>اكتب فكرة <ArrowUpLeft size={14} /></button></div>}
              </section>
            </>
          )}

          {activeView === 'projects' && (
            <section className="page-section">
              <div className="page-toolbar"><div className="search-box"><Search size={17} /><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="ابحث في مشروعاتك…" /><kbd>⌕</kbd></div><button className="primary-button" onClick={() => setActiveView('home')}><Plus size={17} /> مشروع جديد</button></div>
              <div className="project-page-summary"><div><span className="summary-label">إجمالي المشروعات</span><strong>{filteredProjects.length.toLocaleString('ar-EG')}</strong></div><div><span className="summary-label">نسبة الفيديوهات المنتَجة</span><strong>{filteredProjects.filter(p => p.video_url).length ? Math.round(filteredProjects.filter(p => p.video_url).length / Math.max(1, filteredProjects.length) * 100) : 0}<small>%</small></strong></div><div><span className="summary-label">المقاس الافتراضي</span><strong>9:16</strong></div></div>
              {filteredProjects.length ? <div className="project-grid projects-full-grid">{filteredProjects.map(project => <ProjectCard key={project.id} project={project} onOpen={openProject} />)}</div> : <EmptyProjects onCreate={() => setActiveView('home')} />}
            </section>
          )}

          {activeView === 'channels' && (
            <section className="page-section">
              <div className="channels-intro"><div><span className="section-kicker">CHANNEL MANAGEMENT</span><h2>كل قناة ليها شخصيتها.</h2><p>اللغة والصوت والبرومبتات مستقلة لكل قناة.</p></div><button className="primary-button" disabled={channels.length >= 2} onClick={startAddChannel}><Plus size={17} /> إضافة قناة <span className="button-capacity">{channels.length}/2</span></button></div>
              <div className="channels-grid">
                {channels.map(channel => <article className={`channel-card ${activeChannel?.id === channel.id ? 'channel-current' : ''}`} key={channel.id}><div className="channel-card-top"><span className="channel-avatar large">{(channel.name || 'C').slice(0,1)}</span><span className="channel-card-type"><span className="tiny-green-dot" /> {activeChannel?.id === channel.id ? 'القناة النشطة' : 'قناة محفوظة'}</span><button className="icon-button" aria-label="تحديد القناة" onClick={() => { setActiveChannelId(channel.id); setActiveView('home'); notify('تم التبديل إلى قناة ' + channel.name) }}><ArrowDownLeft size={17} /></button></div><h3>{channel.name}</h3><p className="channel-handle" dir="ltr">@{(channel.username || '').replace(/^@/,'')}</p><p className="channel-niche">{channel.niche}</p><div className="channel-settings-tags"><span><Mic2 size={13} />{channel.voice_gender === 'male' ? 'صوت رجالي' : 'صوت نسائي'}</span><span><Globe2 size={13} />{channel.language === 'en' ? 'English' : channel.language === 'tr' ? 'Türkçe' : channel.language === 'ar' ? 'فصحى' : 'مصري'}</span><span><Video size={13} />9:16</span></div><button className="channel-prompt-button" onClick={() => { setSelectedProject({ id: channel.id, title: `هوية ${channel.name}`, idea: channel.niche, prompt_pack: channel.prompt_pack || createPromptPack(channel), duration_seconds: Number(channel.duration || 45), created_at: channel.created_at, is_channel_profile: true, stage: 'حزمة برومبتات القناة' }) }}><FileText size={15} /> عرض حزمة البرومبتات <ChevronLeft size={15} /></button></article>)}
                {channels.length < 2 && <button className="add-channel-card" onClick={startAddChannel}><span className="add-channel-big"><Plus size={24} /></span><strong>قناة جديدة</strong><small>بحد أقصى قناتين لكل حساب</small></button>}
              </div>
              {!channels.length && <EmptyProjects onCreate={startAddChannel} />}
              <div className="security-note"><ShieldCheck size={18} /><p><strong>قنواتك منفصلة.</strong> كل قناة تحتفظ بإعدادات صوتها ولغتها ونيشها. في الوضع المتصل، تقيّد قاعدة البيانات الوصول إلى القنوات والمشروعات الخاصة بكل مستخدم.</p></div>
            </section>
          )}

          {activeView === 'settings' && (
            <section className="page-section settings-page">
              <div className="settings-intro"><span className="settings-icon"><SlidersHorizontal size={21} /></span><div><span className="section-kicker">PERSONAL WORKSPACE</span><h2>تفضيلات الاستوديو</h2><p>الإعدادات الافتراضية تتبع القناة النشطة، ويمكنك تعديل كل قناة بشكل مستقل.</p></div></div>
              <div className="settings-card"><div className="settings-card-header"><div><h3>إعدادات القناة النشطة</h3><p>{activeChannel?.name || 'لم يتم إعداد قناة بعد'}</p></div><span className="soft-tag">DEFAULTS</span></div>{activeChannel ? <><div className="settings-row"><span className="settings-row-icon"><Mic2 size={17} /></span><div><strong>الصوت الافتراضي</strong><small>نوع التعليق الصوتي لجميع المشروعات الجديدة</small></div><span className="settings-value">{activeChannel.voice_gender === 'male' ? 'رجالي' : 'نسائي'}</span></div><div className="settings-row"><span className="settings-row-icon"><Globe2 size={17} /></span><div><strong>اللغة</strong><small>اللغة أو اللهجة الافتراضية للمحتوى</small></div><span className="settings-value">{activeChannel.language === 'en' ? 'English' : activeChannel.language === 'tr' ? 'Türkçe' : activeChannel.language === 'ar' ? 'العربية الفصحى' : 'المصرية'}</span></div><div className="settings-row"><span className="settings-row-icon"><Video size={17} /></span><div><strong>مقاس الفيديو</strong><small>المقاس الأساسي لكل المخرجات</small></div><span className="settings-value">عمودي · 9:16</span></div><div className="settings-row"><span className="settings-row-icon"><Clock3 size={17} /></span><div><strong>المدة الافتراضية</strong><small>تُستخدم تلقائيًا عند بدء مشروع جديد</small></div><span className="settings-value">{activeChannel.default_duration_seconds || 45} ثانية</span></div><div className="settings-row"><span className="settings-row-icon"><ShieldCheck size={17} /></span><div><strong>هوية القناة</strong><small>علامة بيضاء أسفل الفيديو</small></div><span className="settings-value">{activeChannel.watermark_enabled ? 'مفعّلة' : 'متوقفة'}</span></div><div className="settings-row"><span className="settings-row-icon"><AudioLines size={17} /></span><div><strong>الترجمة</strong><small>عبارات تظهر متزامنة مع التعليق</small></div><span className="settings-value">{activeChannel.captions_enabled ? 'مفعّلة' : 'متوقفة'}</span></div><button className="secondary-button settings-edit-button" onClick={() => { setSetup({ ...defaultSetup, channelName: activeChannel.name || '', username: activeChannel.username || '', niche: activeChannel.niche || '', audience: activeChannel.audience || '', duration: String(activeChannel.default_duration_seconds || 45), language: activeChannel.language || 'ar-EG', voiceGender: activeChannel.voice_gender || 'female', visualStyle: activeChannel.visual_style || 'سينمائي واقعي', captions: activeChannel.captions_enabled ?? true, watermark: activeChannel.watermark_enabled ?? true }); setSetupStep(1); setEditingChannelId(activeChannel.id); setOnboardingAdding(false); setOnboardingOpen(true); setSetupError('') }}><SlidersHorizontal size={16} /> مراجعة تفضيلات القناة</button></> : <EmptyProjects onCreate={startAddChannel} />}</div>
              <div className="settings-card"><div className="settings-card-header"><div><h3>الحساب والخصوصية</h3><p>نظرة على حالة بيئة العمل والاتصال</p></div><span className="settings-safe-icon"><ShieldCheck size={20} /></span></div><div className="settings-row"><span className="settings-row-icon"><UserRound size={17} /></span><div><strong>طريقة الدخول</strong><small>{user?.email || 'لم يتم ربط حساب حقيقي'}</small></div><span className="settings-value">{user ? 'Supabase Auth' : 'معاينة محلية'}</span></div><div className="settings-row"><span className="settings-row-icon"><Layers3 size={17} /></span><div><strong>حد القنوات</strong><small>العدد الأقصى لكل مستخدم</small></div><span className="settings-value">{channels.length}/2</span></div><div className="settings-row"><span className="settings-row-icon"><LockKeyhole size={17} /></span><div><strong>تخزين البيانات</strong><small>{supabaseConfigured ? 'مصادقة وقاعدة بيانات مهيأتان في الواجهة' : 'هذا المتصفح فقط — لا ترفع بيانات حساسة'}</small></div><span className={`status-tag ${supabaseConfigured ? 'is-live' : ''}`}>{supabaseConfigured ? 'Configured' : 'Preview'}</span></div></div>
            </section>
          )}
          <footer className="workspace-footer"><Brand compact /><span>صُمّم لصنّاع المحتوى، بتفاصيل تهمّهم.</span><span>© CUTO Studio 2026</span></footer>
        </div>
      </section>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)} onDownload={downloadProject} onGenerateNarration={handleGenerateNarration} narrationLoading={narrationLoading} onCopyCaption={handleCopyCaption} onGenerateVideo={handleGenerateVideo} videoGenerationLoading={videoGenerationProjectId === selectedProject.id} />}
      {onboardingOpen && <Onboarding setup={setup} setSetup={setSetup} step={setupStep} setStep={setSetupStep} onSubmit={handleSetupSubmit} onClose={() => { setOnboardingOpen(false); setOnboardingAdding(false); setSetupError('') }} loading={setupSaving} adding={onboardingAdding} editing={Boolean(editingChannelId)} error={setupError} onPreviewVoice={handleVoicePreview} voicePreviewUrl={voicePreviewUrl} voicePreviewLoading={voicePreviewLoading} clearVoicePreview={() => setVoicePreviewUrl(null)} />}
    </main>
  )
}

export default App
