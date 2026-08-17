/**
 * Blog posts — task-13 brief: "3-4 substantive posts on food waste in
 * Turkey ... these exist to earn links and rank, so they must be worth
 * reading." Grounded in TÜİK's 2025 household food waste breakdown
 * (fresh produce 39.7%, bread 32.5% — also cited in
 * docs/plans/2026-08-12-kurtar-master-plan.md §1) and the platform's own
 * real mechanics (settlement math, cancellation-deadline rule, legal
 * basis) rather than generic "reduce food waste" filler.
 *
 * Structured as typed content blocks (not raw HTML/markdown) so the
 * renderer (app/[locale]/blog/[slug]/page.tsx) stays a plain server
 * component with no markdown-parsing dependency.
 */

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

export interface BlogPost {
  slug: string;
  publishedAt: string; // ISO date
  minuteRead: number;
  title: { tr: string; en: string };
  description: { tr: string; en: string };
  body: { tr: BlogBlock[]; en: BlogBlock[] };
}

export const blogPosts: BlogPost[] = [
  {
    slug: "turkiyede-gida-israfi-buyuklugu",
    publishedAt: "2026-07-14",
    minuteRead: 6,
    title: {
      tr: "Türkiye'de gıda israfı gerçekten ne kadar büyük?",
      en: "How big is Turkey's food waste problem, really?",
    },
    description: {
      tr: "TÜİK'in 2025 hanehalkı gıda israfı verilerine göre meyve-sebze %39,7, ekmek %32,5 ile başı çekiyor. Bu rakamların arkasında ne var, neden bu iki kategori bu kadar öne çıkıyor?",
      en: "According to TÜİK's 2025 household food waste figures, fresh produce (39.7%) and bread (32.5%) lead by a wide margin. What's behind those numbers, and why do these two categories dominate?",
    },
    body: {
      tr: [
        {
          type: "p",
          text: "Türkiye İstatistik Kurumu'nun (TÜİK) 2025 hanehalkı gıda israfı araştırması, çoğu insanın tahmininden daha net bir tablo çiziyor: israf edilen gıdanın büyük kısmı, aslında yalnızca iki kategoride toplanıyor. Meyve ve sebze, toplam hanehalkı gıda israfının %39,7'sini oluştururken, ekmek tek başına %32,5'lik bir payla ikinci sırada yer alıyor. Bu iki kategori birlikte, evlerde çöpe giden gıdanın yaklaşık dörtte üçünü açıklıyor.",
        },
        {
          type: "p",
          text: "Bu oranların yüksek çıkmasının nedeni, aslında iki ürünün de doğasında gizli. Ekmek, Türkiye'de neredeyse her öğünde bulunan, günlük taze tüketilmesi beklenen bir üründü — bir gün önceden kalan ekmek çoğu hanede 'bayat' kabul edilip atılıyor, oysa aynı ekmek fırında hâlâ satılabilir durumdaydı. Meyve-sebze ise raf ömrü kısa, günlük alışverişle yenilenen, ama tüketim hızının tahmin edilmesi zor bir kategori — biraz fazla alınan veya olgunluğu ilerleyen ürün, market ya da manav rafında değil, çoğunlukla evde çöpe gidiyor.",
        },
        { type: "h2", text: "Peki bu israf nerede oluyor — evde mi, işletmede mi?" },
        {
          type: "p",
          text: "TÜİK'in araştırması hanehalkı düzeyinde israfı ölçüyor, yani bu rakamlar doğrudan tüketicinin mutfağında olan israfı yansıtıyor. Ama zincirin bir önceki halkası da aynı sorunu yaşıyor: fırınlar, pastaneler, kafeler, restoranlar ve manavlar da gün içinde ürettikleri veya stokladıkları ürünün tamamını satamıyor. Aradaki fark şu — işletmedeki fazla, kapanış saatine kadar hâlâ tazeliğini koruyan, satılabilir durumda bir üründür. Evdeki israf genellikle çok daha geç fark edilir; ürün artık gerçekten bozulmuş ya da unutulmuş olur.",
        },
        {
          type: "p",
          text: "Bu ayrım önemli, çünkü iki sorunun çözümü de farklı. Hanehalkı israfını azaltmak, alışveriş planlaması ve tüketim alışkanlıklarıyla ilgili bir davranış değişikliği meselesi. İşletme tarafındaki fazlayı önlemek ise daha basit bir mekanizma sorunu: kapanışa kadar hâlâ satılabilir durumda olan ürünü, o ürünü isteyen birine, çöpe gitmeden önce ulaştırmak.",
        },
        { type: "h2", text: "Sürpriz paket modeli tam olarak bu ikinci soruna cevap veriyor" },
        {
          type: "p",
          text: "kurtar gibi platformların çözmeye çalıştığı problem, ürünün israf olmasını beklemek değil, kapanışa yaklaşırken hâlâ satılabilir durumdaki fazlayı — indirimli ama gerçek bir satış olarak — bir alıcıya ulaştırmak. Bu, ekmek ve meyve-sebze kategorilerinde özellikle etkili, çünkü ikisi de TÜİK verisinde en yüksek payı taşıyor ve ikisi de kapanış saatine kadar hâlâ taze, satılabilir ürünler.",
        },
        {
          type: "p",
          text: "Rakamlar büyük görünse de çözüm karmaşık olmak zorunda değil: doğru zamanda doğru fiyata satışa çıkan bir ürün, çöpe gitmek yerine bir sofraya gidiyor.",
        },
      ],
      en: [
        {
          type: "p",
          text: "The Turkish Statistical Institute's (TÜİK) 2025 household food waste survey paints a clearer picture than most people's guesses: the bulk of wasted food actually concentrates in just two categories. Fresh produce accounts for 39.7% of total household food waste, and bread alone follows at 32.5%. Together, these two categories explain roughly three-quarters of what ends up in the bin at home.",
        },
        {
          type: "p",
          text: "The reason both figures run so high is baked into how each product works. Bread appears at nearly every meal in Turkey and is expected fresh, daily — a loaf left over from yesterday is considered stale in most households and thrown out, even though the same loaf might still be sellable at the bakery. Fresh produce has a short shelf life, gets replenished with near-daily shopping, and is genuinely hard to plan consumption for — a little extra bought, or a piece that's ripened past its ideal window, usually ends up in the kitchen bin rather than the store shelf.",
        },
        { type: "h2", text: "So where does this waste actually happen — at home, or in the business?" },
        {
          type: "p",
          text: "TÜİK's survey measures waste at the household level, so these figures directly reflect what happens in a consumer's own kitchen. But the link before that in the chain faces the same problem: bakeries, pâtisseries, cafés, restaurants, and greengrocers can't sell everything they produce or stock in a given day either. The difference is this — a business's surplus is still fresh and sellable right up to closing time. Waste at home is usually noticed much later, once the product has genuinely spoiled or been forgotten.",
        },
        {
          type: "p",
          text: "That distinction matters, because the two problems need different fixes. Reducing household waste is a behaviour-change question tied to shopping planning and consumption habits. Preventing surplus on the business side is a simpler mechanism problem: getting a product that's still sellable right up to closing into the hands of someone who wants it, before it's thrown out.",
        },
        { type: "h2", text: "The surprise-bag model answers exactly that second problem" },
        {
          type: "p",
          text: "What platforms like kurtar try to solve isn't waiting for a product to become waste — it's getting the surplus that's still sellable as closing approaches to a buyer, as a real discounted sale. That's especially effective for bread and fresh produce, since both carry the highest share in TÜİK's data and both remain fresh and sellable right up to closing time.",
        },
        {
          type: "p",
          text: "The numbers look big, but the fix doesn't have to be complicated: a product listed at the right time, at the right price, ends up on a table instead of in the bin.",
        },
      ],
    },
  },
  {
    slug: "surpriz-paket-modeli-nasil-calisir",
    publishedAt: "2026-07-21",
    minuteRead: 7,
    title: {
      tr: "'Sürpriz paket' modeli nasıl çalışıyor, neden sabit ücret?",
      en: "How does the 'surprise bag' model work, and why a fixed fee?",
    },
    description: {
      tr: "İşletmeler neden cironun bir yüzdesi yerine paket başına sabit bir ücret öder? Sürpriz paket ekonomisinin arkasındaki mantığı, dünyadaki örneklerle birlikte açıklıyoruz.",
      en: "Why do businesses pay a fixed fee per bag instead of a percentage of revenue? We break down the logic behind the surprise-bag economy, with real-world reference points.",
    },
    body: {
      tr: [
        {
          type: "p",
          text: "'Sürpriz paket' modelinin özeti basit: bir işletme, gün sonunda elinde kalan taze ürünü tek bir fiyata, içeriği önceden belirtilmeden satışa çıkarır. Alıcı ürünün kategori ve yaklaşık değerini bilir, tam listesini bilmez. Bu belirsizlik bir eksiklik değil, modelin çalışmasını sağlayan asıl mekanizma — çünkü işletme, gün içinde elinde ne kalacağını sabah kestiremiyor.",
        },
        {
          type: "p",
          text: "Bu model dünyada yeni değil. Avrupa'da milyonlarca kullanıcıya ulaşan Too Good To Go, ABD'de yaklaşık 1,79 dolar paket başı ücret ve 89 dolar yıllık işletme üyeliğiyle çalışıyor; paket, içeriğinin gerçek değerinin yaklaşık üçte birine satılıyor. Avrupa'da paket başı ücret yaklaşık 1,09 avro civarında. Türkiye'de daha önce Fazla adlı bir girişim benzer bir model denedi, ama tüketici uygulaması zamanla aktif kullanımını kaybetti.",
        },
        { type: "h2", text: "Neden yüzde komisyon değil, sabit ücret?" },
        {
          type: "p",
          text: "Çoğu pazaryeri modeli, satılan ürünün fiyatının bir yüzdesini komisyon olarak alır — bu, ürün fiyatı yükseldikçe platformun kazancının da otomatik olarak artması demektir. Sürpriz paket modelinde bu mantık işlemiyor, çünkü fiyat zaten düşürülmüş durumda: bir kafenin 350 ₺ değerindeki içeriği 119 ₺'ye satılıyorsa, bu fiyatın üzerine bir de yüzde komisyon eklemek, işletmenin eline geçen tutarı orantısız şekilde küçültür.",
        },
        {
          type: "p",
          text: "Sabit ücret modeli bunun yerine basit bir soru sorar: paket satıldı mı, satılmadı mı? Satıldıysa sabit bir tutar (kurtar'da 25 ₺ + KDV) kesilir; satılmadıysa hiçbir ücret yoktur. İşletme için bu, kâr marjını önceden hesaplayabileceği, cironun büyüklüğüne göre değişmeyen öngörülebilir bir maliyet demek.",
        },
        { type: "h2", text: "Yıllık üyelik neden peşin alınmıyor?" },
        {
          type: "p",
          text: "TGTG usulü modellerin bir diğer ortak noktası, yıllık bir işletme üyelik ücreti almaları — ama bunu genellikle peşin değil, işletmenin platformda fiilen kazandığı paradan mahsup ederek yapmaları. Mantık şu: bir işletme daha ilk paketini satmadan önce sabit bir üyelik ücreti ödemek zorunda kalırsa, modelin kendi vaadiyle ('risk yok, satmazsanız ödemezsiniz') çelişir. Üyelik ücretini kazançtan düşmek, bu riski platformun üstlenmesi anlamına gelir — işletme gerçekten satış yapmadan hiçbir şey ödemez.",
        },
        { type: "h2", text: "Modelin sınırları" },
        {
          type: "p",
          text: "Bu modelin her işletme için aynı ölçüde işe yaradığını iddia etmiyoruz. Günlük, öngörülebilir bir fazlası olan işletmeler (fırın gibi) için mekanizma çok net çalışır. Fazlası daha değişken olan işletmeler için ise günlük paket sayısını doğru tahmin etmek zaman alabilir — bu yüzden kurtar'da ilk haftalarda işletmenin kendi paket sayısını deneyerek ayarlamasına izin verilir, sabit bir asgari taahhüt yoktur.",
        },
      ],
      en: [
        {
          type: "p",
          text: "The 'surprise bag' model, in short: a business lists whatever fresh surplus it has left at the end of the day, at one fixed price, without specifying the exact contents in advance. A buyer knows the category and roughly what it's worth; they don't know the exact item list. That uncertainty isn't a flaw — it's the actual mechanism that makes the model work, because the business itself can't predict in the morning what will be left over by evening.",
        },
        {
          type: "p",
          text: "This model isn't new globally. Too Good To Go, reaching millions of users across Europe, runs on roughly $1.79 per bag plus an $89 annual business membership in the US; a bag typically sells for about a third of its contents' real value. In Europe, the per-bag fee runs around €1.09. Turkey previously saw a startup called Fazla attempt a similar model, though its consumer app lost meaningful active usage over time.",
        },
        { type: "h2", text: "Why a fixed fee instead of a percentage commission?" },
        {
          type: "p",
          text: "Most marketplace models take a percentage commission on the sale price — meaning the platform's take automatically grows as the item's price rises. That logic breaks down for surprise bags, because the price is already deeply discounted: if a café's ₺350 worth of contents sells for ₺119, stacking a percentage commission on top of that price disproportionately shrinks what the business actually keeps.",
        },
        {
          type: "p",
          text: "A fixed-fee model asks a simpler question instead: did the bag sell, or not? If it sold, a fixed amount is charged (₺25 + VAT on kurtar); if it didn't, nothing is. For a business, that means a cost it can predict ahead of time, one that doesn't scale with how large its revenue happens to be.",
        },
        { type: "h2", text: "Why isn't the annual membership charged upfront?" },
        {
          type: "p",
          text: "Another common trait of TGTG-style models is an annual business membership fee — but typically offset from what the business actually earns on the platform, rather than charged upfront. The logic: if a business had to pay a fixed membership fee before selling a single bag, it would contradict the model's own promise ('no risk — if it doesn't sell, you don't pay'). Deducting the membership fee from earnings instead means the platform absorbs that risk — a business that hasn't actually sold anything pays nothing at all.",
        },
        { type: "h2", text: "Where the model has limits" },
        {
          type: "p",
          text: "We're not claiming this model works equally well for every business. For businesses with a daily, predictable surplus (a bakery, say), the mechanism runs cleanly. For businesses whose surplus varies more, getting the daily bag count right can take some trial and error — which is why kurtar lets a business adjust its own bag count by experimenting in the first few weeks, with no fixed minimum commitment.",
        },
      ],
    },
  },
  {
    slug: "firin-gun-sonunda-ekmegini-neden-atiyor",
    publishedAt: "2026-07-29",
    minuteRead: 5,
    title: {
      tr: "Bir fırın gün sonunda ekmeğini neden atar, alternatifi ne?",
      en: "Why does a bakery throw out bread at closing, and what's the alternative?",
    },
    description: {
      tr: "Fırınlar neden her gün fazla üretir, elde kalanı neden bağışlamak her zaman mümkün olmaz, ve satışa çıkarmak neden çoğu zaman daha sürdürülebilir bir çözümdür.",
      en: "Why bakeries overproduce daily, why donation isn't always practical for the leftover, and why selling it is often the more sustainable fix.",
    },
    body: {
      tr: [
        {
          type: "p",
          text: "Bir fırının vitrinindeki ekmek çeşitliliği, aslında bir tahmin oyununun sonucudur. Fırınlar, o gün ne kadar müşteri geleceğini, hangi saatte hangi ürünün tükeneceğini önceden bilemez — bu yüzden genellikle ihtiyacın biraz üzerinde üretir. Az üretmenin bedeli, gün ortasında rafın boş kalması ve o günkü satışın kaybedilmesidir; fazla üretmenin bedeli ise kapanışta elde kalan üründür. Çoğu fırın, ikinci riski göze alır — çünkü boş bir vitrin, dolu bir vitrinden daha pahalıya mal olur.",
        },
        { type: "h2", text: "Bağış her zaman mümkün mü?" },
        {
          type: "p",
          text: "Fazla gıdayı bağışlamak akla gelen ilk çözüm gibi görünse de, pratikte her işletme için aynı ölçüde uygulanabilir değil. Düzenli bağış, bir sivil toplum kuruluşuyla lojistik bir anlaşma, günlük teslim rutinini yönetecek personel zamanı ve bazı durumlarda soğuk zincir gerektirir. Küçük bir mahalle fırını için bu, günlük operasyonun üstüne binen ek bir yük olabilir — özellikle bağışlanacak miktar gün gün değişiyorsa.",
        },
        {
          type: "p",
          text: "Bağışın kendisi de israfı sıfırlamaz, yalnızca kimin tükettiğini değiştirir; işletme için hâlâ bir gelir kaybıdır. Bu, bağışı değersiz kılmaz — özellikle STK'larla düzenli çalışabilen büyük işletmeler için anlamlı bir kanaldır — ama her ölçekteki işletme için tek başına yeterli bir çözüm değildir.",
        },
        { type: "h2", text: "Satış, gelire dönüştüren üçüncü seçenek" },
        {
          type: "p",
          text: "Sürpriz paket modeli, bağış ile çöp arasında üçüncü bir seçenek sunar: ürünü, gerçek değerinin altında ama sıfır olmayan bir fiyata satmak. Fırın için bu, hem çöpe giden ürün miktarını azaltır hem de aksi halde kayıp olacak bir maliyeti kısmen telafi eder. Müşteri için ise gerçek bir indirim, üstelik önceden bilinen bir kategori ve fiyatla.",
        },
        {
          type: "p",
          text: "Operasyonel olarak da fırın tarafında ek bir yük yaratmaz: paket şablonu bir kez tanımlanır, günlük iş yalnızca o günkü miktarı ve teslim saatini girmekten ibarettir. Teslimde yapılan tek işlem, müşterinin kodunu okutmaktır.",
        },
        { type: "h2", text: "Neden fırın önce?" },
        {
          type: "p",
          text: "Sürpriz paket platformlarının çoğu, genişlemeye fırın kategorisiyle başlar — çünkü fırının günlük fazlası en öngörülebilir olanıdır: her gün üretilir, her gün kapanışta ya satılır ya da elde kalır. Bu öngörülebilirlik, hem işletme hem platform için modelin ilk kez denenmesini kolaylaştırır.",
        },
      ],
      en: [
        {
          type: "p",
          text: "The variety of bread in a bakery's window is really the outcome of a daily guessing game. A bakery can't know in advance exactly how many customers will come in, or which item will sell out at which hour — so it typically produces a bit more than it expects to need. Underproducing means an empty shelf mid-afternoon and lost sales that day; overproducing means leftover product at closing. Most bakeries accept the second risk, because an empty display case costs more than a full one.",
        },
        { type: "h2", text: "Is donation always an option?" },
        {
          type: "p",
          text: "Donating surplus food seems like the obvious first answer, but in practice it isn't equally workable for every business. A regular donation arrangement needs a logistics agreement with a charity, staff time to manage a daily handover routine, and in some cases a cold chain. For a small neighbourhood bakery, that can be an extra layer of operational load on top of a normal day — especially when the amount to donate varies from one day to the next.",
        },
        {
          type: "p",
          text: "Donation itself doesn't zero out the waste either — it just changes who consumes it; it's still a lost sale for the business. That doesn't make donation worthless — it's a genuinely meaningful channel, particularly for larger businesses that can sustain a regular arrangement with a charity — but it isn't, on its own, a sufficient answer for a business of every size.",
        },
        { type: "h2", text: "Selling it: a third option that turns it into revenue" },
        {
          type: "p",
          text: "The surprise-bag model offers a third option between donation and the bin: selling the product below its real value, but not for nothing. For a bakery, that reduces how much product ends up wasted and partially offsets a cost that would otherwise be a pure loss. For the customer, it's a genuine discount, with a known category and price up front.",
        },
        {
          type: "p",
          text: "Operationally, it adds no real extra load on the bakery's side either: the bag template is defined once, and the daily task is just entering that day's quantity and pickup time. The only step at handover is scanning the customer's code.",
        },
        { type: "h2", text: "Why bakeries first?" },
        {
          type: "p",
          text: "Most surprise-bag platforms expand into the bakery category first — because a bakery's daily surplus is the most predictable kind there is: it's produced every day, and every day it either sells by closing or it doesn't. That predictability makes the model easiest to prove out first, for both the business and the platform.",
        },
      ],
    },
  },
  {
    slug: "bozulabilir-gidada-cayma-hakki-neden-yok",
    publishedAt: "2026-08-05",
    minuteRead: 5,
    title: {
      tr: "Mesafeli satışta 'cayma hakkı' bozulabilir gıdada neden yok?",
      en: "Why doesn't the right of withdrawal apply to perishable food?",
    },
    description: {
      tr: "Türkiye'de mesafeli satışlarda tüketiciye tanınan 14 günlük cayma hakkı, çabuk bozulabilen gıdalar için neden geçerli değil? kurtar bu istisnayı nasıl uyguluyor?",
      en: "Turkish consumer law grants a 14-day right of withdrawal on distance sales — so why doesn't it apply to perishable food? Here's how kurtar applies that exception.",
    },
    body: {
      tr: [
        {
          type: "p",
          text: "Türkiye'de internetten yapılan çoğu alışverişte tüketicinin yasal bir hakkı var: Mesafeli Sözleşmeler Yönetmeliği uyarınca, teslim aldığı üründen 14 gün içinde hiçbir gerekçe göstermeden vazgeçebilir, ürünü iade edip parasını geri alabilir. Bu hak, tüketiciyi mesafeli alışverişin (ürünü elle inceleyemeden satın almanın) getirdiği belirsizliğe karşı korur.",
        },
        {
          type: "p",
          text: "Ama aynı yönetmelik, bu genel kuralın işlemediği bazı ürün kategorilerini de ayrıca tanımlar — ve 'çabuk bozulabilen veya son kullanma tarihi kısa süre içinde geçebilecek malların teslimi' bunlardan biridir. Bir sürpriz paketteki taze ekmek, pasta dilimi veya hazır yemek tam olarak bu tanıma giriyor: 14 gün sonra iade edilebilecek bir ürün değil, saatler içinde tüketilmesi beklenen bir gıda.",
        },
        { type: "h2", text: "Bu istisna neden mantıklı?" },
        {
          type: "p",
          text: "Cayma hakkının pratik sonucu, satıcının ürünü geri alıp yeniden satabilmesidir. Bir kıyafet ya da elektronik eşya için bu mümkündür. Ama teslim alınmış, paketten çıkmış taze bir gıda ürünü için bu fiziksel olarak mümkün değil — ürün geri alınsa bile yeniden satılamaz, sadece çöpe gider. İstisna, bu gerçeği göz ardı etmek yerine kabul ediyor.",
        },
        {
          type: "p",
          text: "Bu, tüketicinin hiçbir korumaya sahip olmadığı anlamına gelmiyor. kurtar'da bu korumanın karşılığı farklı bir mekanizmayla sağlanıyor: rezervasyonu, teslim penceresinin başlamasına en geç 2 saat kalana kadar ücretsiz iptal edebilirsiniz. Bu pencere, cayma hakkının yerini alan, ama ürünün israf olma riskini artırmayan bir uzlaşma — işletme, son 2 saate kadar iptal riskini bilerek paketi ayırır, siz de fikrinizi değiştirme hakkına sahip olursunuz.",
        },
        { type: "h2", text: "Ön bilgilendirme neden önemli" },
        {
          type: "p",
          text: "Yasal çerçeve, satıcıyı — ve aracı platformu — tüketiciyi bu istisna konusunda satın alma öncesinde açıkça bilgilendirmekle yükümlü kılıyor. kurtar'da bu bilgilendirme iki yerde yapılıyor: her paketin satın alma ekranında ve platformun ön bilgilendirme formunda (bkz. Yasal bölümü). İkisi de aynı şeyi söylüyor — teslim penceresi başlamadan 2 saat öncesine kadar iptal serbest, sonrasında değil — çünkü bu, sürprizin sadece içerikte değil, koşullarda da olmaması gereken tek nokta.",
        },
        {
          type: "p",
          text: "Sonuç olarak: cayma hakkının olmaması bir eksiklik değil, ürünün doğasına uyan bir düzenleme. Asıl önemli olan, bu istisnanın açıkça söylenmesi ve yerine makul bir iptal penceresinin konmuş olması.",
        },
      ],
      en: [
        {
          type: "p",
          text: "In most online purchases in Turkey, consumers have a legal right: under the Distance Contracts Regulation, they can withdraw from a purchase within 14 days of delivery, without giving a reason, and get a refund. That right protects consumers against the uncertainty that comes with buying something they couldn't inspect by hand before purchase.",
        },
        {
          type: "p",
          text: "But the same regulation also carves out specific product categories where that general rule doesn't apply — and 'delivery of goods that are perishable or that may expire quickly' is one of them. Fresh bread, a cake slice, or a prepared dish inside a surprise bag falls squarely into that definition: not a product you could plausibly return after 14 days, but food meant to be eaten within hours.",
        },
        { type: "h2", text: "Why does this exception make sense?" },
        {
          type: "p",
          text: "The practical effect of a right of withdrawal is that the seller gets the product back and can resell it. That works for clothing or electronics. It doesn't work, physically, for a fresh food item that's already been handed over and unpacked — even if it were returned, it couldn't be resold, only thrown away. The exception acknowledges that reality instead of ignoring it.",
        },
        {
          type: "p",
          text: "That doesn't mean the consumer has no protection at all. On kurtar, that protection comes through a different mechanism: you can cancel your reservation for free up until 2 hours before the pickup window starts. That window is the compromise that stands in for the right of withdrawal, without adding waste risk back into the product — a business sets a bag aside knowing cancellation stays possible up to that point, and you keep the ability to change your mind.",
        },
        { type: "h2", text: "Why the pre-contract disclosure matters" },
        {
          type: "p",
          text: "The legal framework requires the seller — and the intermediary platform — to clearly inform the consumer about this exception before purchase. On kurtar, that disclosure happens in two places: on every bag's purchase screen, and in the platform's pre-contract information form (see the Legal section). Both say the same thing — cancellation is free up to 2 hours before the pickup window starts, not after — because that's the one place the surprise shouldn't extend beyond the contents into the terms themselves.",
        },
        {
          type: "p",
          text: "The bottom line: the absence of a withdrawal right isn't a gap — it's a rule that fits the nature of the product. What actually matters is that the exception is stated plainly, and that a reasonable cancellation window stands in its place.",
        },
      ],
    },
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

export function getSortedBlogPosts(): BlogPost[] {
  return [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}
