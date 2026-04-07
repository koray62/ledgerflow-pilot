import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AccountTemplate {
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  description: string;
  parentCode?: string;
}

function getChartOfAccounts(currency: string): { parents: AccountTemplate[]; children: AccountTemplate[] } {
  switch (currency) {
    case "TRY":
      return getTurkishCoA();
    case "SAR":
      return getSaudiCoA();
    case "AED":
      return getUAECoA();
    case "EUR":
      return getEUCoA();
    case "USD":
    default:
      return getUSCoA();
  }
}

// ──── US GAAP (USD) ────
function getUSCoA() {
  const parents: AccountTemplate[] = [
    { code: "1000", name: "Assets", account_type: "asset", description: "Resources owned by the entity." },
    { code: "2000", name: "Liabilities", account_type: "liability", description: "Obligations or debts owed to external parties." },
    { code: "3000", name: "Equity", account_type: "equity", description: "The owner's residual interest in the assets." },
    { code: "4000", name: "Operating Revenue", account_type: "revenue", description: "Income generated from core business activities." },
    { code: "5000", name: "Cost of Goods Sold (COGS)", account_type: "expense", description: "Direct costs attributable to the production of the goods sold." },
    { code: "6000", name: "Operating Expenses", account_type: "expense", description: "Indirect costs required to run the business (OPEX)." },
    { code: "8000", name: "Other Income & Expenses", account_type: "revenue", description: "Non-operating items." },
  ];
  const children: AccountTemplate[] = [
    { code: "1010", name: "Cash and Cash Equivalents", account_type: "asset", description: "Checking, savings, and petty cash.", parentCode: "1000" },
    { code: "1100", name: "Accounts Receivable (AR)", account_type: "asset", description: "Money owed by customers for credit sales.", parentCode: "1000" },
    { code: "1150", name: "Allowance for Doubtful Accounts", account_type: "asset", description: "Contra-asset; estimated uncollectible AR.", parentCode: "1000" },
    { code: "1200", name: "Inventory", account_type: "asset", description: "Goods held for sale.", parentCode: "1000" },
    { code: "1300", name: "Prepaid Expenses", account_type: "asset", description: "Paid insurance, rent, or taxes not yet used.", parentCode: "1000" },
    { code: "1500", name: "Fixed Assets (PP&E)", account_type: "asset", description: "Land, buildings, and machinery.", parentCode: "1000" },
    { code: "1550", name: "Accumulated Depreciation", account_type: "asset", description: "Contra-asset; total depreciation taken to date.", parentCode: "1000" },
    { code: "2010", name: "Accounts Payable (AP)", account_type: "liability", description: "Money owed to vendors/suppliers.", parentCode: "2000" },
    { code: "2100", name: "Accrued Liabilities", account_type: "liability", description: "Expenses incurred but not yet invoiced.", parentCode: "2000" },
    { code: "2200", name: "Deferred Revenue", account_type: "liability", description: "Money received for services not yet performed.", parentCode: "2000" },
    { code: "2300", name: "Notes Payable", account_type: "liability", description: "Formal loan agreements and bank debt.", parentCode: "2000" },
    { code: "2500", name: "Sales Tax Payable", account_type: "liability", description: "Taxes collected from customers to be remitted.", parentCode: "2000" },
    { code: "3010", name: "Common Stock", account_type: "equity", description: "Initial investment by shareholders at par value.", parentCode: "3000" },
    { code: "3100", name: "Additional Paid-in Capital", account_type: "equity", description: "Investment in excess of par value.", parentCode: "3000" },
    { code: "3200", name: "Retained Earnings", account_type: "equity", description: "Cumulative net income minus dividends paid.", parentCode: "3000" },
    { code: "3300", name: "Owner's Draw / Dividends", account_type: "equity", description: "Distributions made to owners or shareholders.", parentCode: "3000" },
    { code: "4010", name: "Sales Revenue", account_type: "revenue", description: "Gross sales of products.", parentCode: "4000" },
    { code: "4020", name: "Service Revenue", account_type: "revenue", description: "Income from professional services.", parentCode: "4000" },
    { code: "4500", name: "Sales Returns and Allowances", account_type: "revenue", description: "(Contra-revenue) Credits given to customers for returns.", parentCode: "4000" },
    { code: "5010", name: "Purchases", account_type: "expense", description: "Raw materials or goods for resale.", parentCode: "5000" },
    { code: "5050", name: "Freight-In", account_type: "expense", description: "Shipping costs to receive inventory.", parentCode: "5000" },
    { code: "5100", name: "Direct Labor", account_type: "expense", description: "Wages for employees directly making the product.", parentCode: "5000" },
    { code: "6010", name: "Payroll Expense", account_type: "expense", description: "Salaries and wages.", parentCode: "6000" },
    { code: "6100", name: "Rent/Lease Expense", account_type: "expense", description: "Facilities costs.", parentCode: "6000" },
    { code: "6200", name: "Utilities Expense", account_type: "expense", description: "Electricity, water, heat.", parentCode: "6000" },
    { code: "6300", name: "Marketing & Advertising", account_type: "expense", description: "Promotion and social media costs.", parentCode: "6000" },
    { code: "6400", name: "Office Supplies", account_type: "expense", description: "Consumable items for daily operations.", parentCode: "6000" },
    { code: "6500", name: "Depreciation Expense", account_type: "expense", description: "Periodic allocation of fixed asset costs.", parentCode: "6000" },
    { code: "8010", name: "Interest Income", account_type: "revenue", description: "Earnings from bank balances.", parentCode: "8000" },
    { code: "9010", name: "Interest Expense", account_type: "expense", description: "Costs of borrowing money.", parentCode: "8000" },
    { code: "9050", name: "Gain/Loss on Sale of Assets", account_type: "expense", description: "Difference between book value and sale price.", parentCode: "8000" },
  ];
  return { parents, children };
}

// ──── Turkish TFRS / MSUGT (TRY) ────
function getTurkishCoA() {
  const parents: AccountTemplate[] = [
    { code: "100", name: "Dönen Varlıklar", account_type: "asset", description: "Bir yıl içinde nakde çevrilmesi beklenen varlıklar." },
    { code: "200", name: "Duran Varlıklar", account_type: "asset", description: "Uzun vadeli varlıklar." },
    { code: "300", name: "Kısa Vadeli Yabancı Kaynaklar", account_type: "liability", description: "Bir yıl içinde ödenmesi gereken borçlar." },
    { code: "400", name: "Uzun Vadeli Yabancı Kaynaklar", account_type: "liability", description: "Bir yıldan uzun vadeli borçlar." },
    { code: "500", name: "Özkaynaklar", account_type: "equity", description: "İşletme sahiplerinin sermayesi." },
    { code: "600", name: "Gelirler", account_type: "revenue", description: "Faaliyet ve diğer gelirler." },
    { code: "700", name: "Maliyet Hesapları", account_type: "expense", description: "Üretim ve hizmet maliyetleri." },
    { code: "770", name: "Genel Yönetim ve Faaliyet Giderleri", account_type: "expense", description: "İşletme giderleri." },
  ];
  const children: AccountTemplate[] = [
    { code: "100.01", name: "Kasa", account_type: "asset", description: "Nakit para mevcudu.", parentCode: "100" },
    { code: "102", name: "Bankalar", account_type: "asset", description: "Banka hesaplarındaki mevduat.", parentCode: "100" },
    { code: "120", name: "Alıcılar", account_type: "asset", description: "Müşterilerden alacaklar (Ticari).", parentCode: "100" },
    { code: "121", name: "Alacak Senetleri", account_type: "asset", description: "Senetli ticari alacaklar.", parentCode: "100" },
    { code: "150", name: "İlk Madde ve Malzeme", account_type: "asset", description: "Hammadde stokları.", parentCode: "100" },
    { code: "153", name: "Ticari Mallar", account_type: "asset", description: "Satış amaçlı mallar.", parentCode: "100" },
    { code: "180", name: "Gelecek Aylara Ait Giderler", account_type: "asset", description: "Peşin ödenmiş giderler.", parentCode: "100" },
    { code: "191", name: "İndirilecek KDV", account_type: "asset", description: "İndirilecek Katma Değer Vergisi.", parentCode: "100" },
    { code: "252", name: "Binalar", account_type: "asset", description: "İşletmeye ait binalar.", parentCode: "200" },
    { code: "253", name: "Tesis, Makine ve Cihazlar", account_type: "asset", description: "Üretim ekipmanları.", parentCode: "200" },
    { code: "254", name: "Taşıtlar", account_type: "asset", description: "Motorlu araçlar.", parentCode: "200" },
    { code: "255", name: "Demirbaşlar", account_type: "asset", description: "Ofis mobilya ve ekipmanları.", parentCode: "200" },
    { code: "257", name: "Birikmiş Amortismanlar (-)", account_type: "asset", description: "Toplam amortisman (Kontra-varlık).", parentCode: "200" },
    { code: "320", name: "Satıcılar", account_type: "liability", description: "Tedarikçilere borçlar.", parentCode: "300" },
    { code: "321", name: "Borç Senetleri", account_type: "liability", description: "Senetli ticari borçlar.", parentCode: "300" },
    { code: "360", name: "Ödenecek Vergi ve Fonlar", account_type: "liability", description: "Gelir vergisi, KDV stopaj vb.", parentCode: "300" },
    { code: "361", name: "Ödenecek Sosyal Güvenlik Kesintileri", account_type: "liability", description: "SGK primleri.", parentCode: "300" },
    { code: "391", name: "Hesaplanan KDV", account_type: "liability", description: "Tahsil edilen KDV.", parentCode: "300" },
    { code: "400.01", name: "Banka Kredileri", account_type: "liability", description: "Uzun vadeli banka borçları.", parentCode: "400" },
    { code: "500.01", name: "Sermaye", account_type: "equity", description: "Ödenmiş sermaye.", parentCode: "500" },
    { code: "520", name: "Geçmiş Yıllar Kârları", account_type: "equity", description: "Dağıtılmamış geçmiş yıl kârları.", parentCode: "500" },
    { code: "570", name: "Geçmiş Yıllar Zararları (-)", account_type: "equity", description: "Geçmiş yıllardan kümülatif zarar.", parentCode: "500" },
    { code: "580", name: "Dönem Net Kârı (Zararı)", account_type: "equity", description: "Cari dönem net sonucu.", parentCode: "500" },
    { code: "600.01", name: "Yurtiçi Satışlar", account_type: "revenue", description: "Yurtiçi mal ve hizmet satışları.", parentCode: "600" },
    { code: "601", name: "Yurtdışı Satışlar", account_type: "revenue", description: "İhracat gelirleri.", parentCode: "600" },
    { code: "610", name: "Satıştan İadeler (-)", account_type: "revenue", description: "Müşteri iadeleri (kontra-gelir).", parentCode: "600" },
    { code: "611", name: "Satış İskontoları (-)", account_type: "revenue", description: "Uygulanan iskontolar.", parentCode: "600" },
    { code: "642", name: "Faiz Gelirleri", account_type: "revenue", description: "Mevduat ve diğer faiz gelirleri.", parentCode: "600" },
    { code: "621", name: "Satılan Ticari Malların Maliyeti", account_type: "expense", description: "STMM.", parentCode: "700" },
    { code: "710", name: "Direkt İlk Madde ve Malzeme Giderleri", account_type: "expense", description: "Üretimde kullanılan hammadde.", parentCode: "700" },
    { code: "720", name: "Direkt İşçilik Giderleri", account_type: "expense", description: "Üretim işçi ücretleri.", parentCode: "700" },
    { code: "770.01", name: "Genel Yönetim Giderleri", account_type: "expense", description: "İdari personel, kira, sigorta vb.", parentCode: "770" },
    { code: "760", name: "Pazarlama Satış ve Dağıtım Giderleri", account_type: "expense", description: "Reklam, nakliye, komisyon.", parentCode: "770" },
    { code: "780", name: "Finansman Giderleri", account_type: "expense", description: "Faiz ve kur farkı giderleri.", parentCode: "770" },
  ];
  return { parents, children };
}

// ──── Saudi SOCPA (SAR) ────
function getSaudiCoA() {
  const parents: AccountTemplate[] = [
    { code: "1000", name: "الأصول / Assets", account_type: "asset", description: "الموارد المملوكة للمنشأة." },
    { code: "2000", name: "الالتزامات / Liabilities", account_type: "liability", description: "الديون والالتزامات تجاه الغير." },
    { code: "3000", name: "حقوق الملكية / Equity", account_type: "equity", description: "حصة المالك المتبقية في الأصول." },
    { code: "4000", name: "الإيرادات / Revenue", account_type: "revenue", description: "الدخل من الأنشطة التشغيلية." },
    { code: "5000", name: "تكلفة المبيعات / COGS", account_type: "expense", description: "التكاليف المباشرة للبضائع المباعة." },
    { code: "6000", name: "المصروفات التشغيلية / OPEX", account_type: "expense", description: "المصروفات غير المباشرة لتشغيل الأعمال." },
    { code: "8000", name: "إيرادات ومصروفات أخرى / Other", account_type: "revenue", description: "بنود غير تشغيلية." },
  ];
  const children: AccountTemplate[] = [
    { code: "1010", name: "النقدية وما في حكمها / Cash", account_type: "asset", description: "النقد في الصندوق والبنوك.", parentCode: "1000" },
    { code: "1100", name: "ذمم مدينة / Accounts Receivable", account_type: "asset", description: "المبالغ المستحقة من العملاء.", parentCode: "1000" },
    { code: "1200", name: "المخزون / Inventory", account_type: "asset", description: "البضائع المعدة للبيع.", parentCode: "1000" },
    { code: "1300", name: "مصروفات مدفوعة مقدماً / Prepaid", account_type: "asset", description: "دفعات مقدمة لم تستهلك بعد.", parentCode: "1000" },
    { code: "1500", name: "أصول ثابتة / Fixed Assets", account_type: "asset", description: "أراضي ومباني ومعدات.", parentCode: "1000" },
    { code: "1550", name: "مجمع الاستهلاك / Accum. Depreciation", account_type: "asset", description: "إجمالي الاستهلاك المتراكم (حساب مقابل).", parentCode: "1000" },
    { code: "2010", name: "ذمم دائنة / Accounts Payable", account_type: "liability", description: "المبالغ المستحقة للموردين.", parentCode: "2000" },
    { code: "2100", name: "مستحقات متراكمة / Accrued Liabilities", account_type: "liability", description: "مصروفات مستحقة لم تسدد.", parentCode: "2000" },
    { code: "2200", name: "إيرادات مؤجلة / Deferred Revenue", account_type: "liability", description: "مبالغ محصلة لخدمات لم تقدم.", parentCode: "2000" },
    { code: "2500", name: "ضريبة القيمة المضافة المستحقة / VAT Payable", account_type: "liability", description: "ضريبة القيمة المضافة المحصلة (15%).", parentCode: "2000" },
    { code: "2510", name: "الزكاة المستحقة / Zakat Payable", account_type: "liability", description: "زكاة الشركات المستحقة لهيئة الزكاة (ZATCA).", parentCode: "2000" },
    { code: "3010", name: "رأس المال / Capital", account_type: "equity", description: "رأس المال المدفوع.", parentCode: "3000" },
    { code: "3200", name: "أرباح مبقاة / Retained Earnings", account_type: "equity", description: "الأرباح المتراكمة غير الموزعة.", parentCode: "3000" },
    { code: "4010", name: "إيرادات المبيعات / Sales Revenue", account_type: "revenue", description: "إيرادات بيع المنتجات.", parentCode: "4000" },
    { code: "4020", name: "إيرادات الخدمات / Service Revenue", account_type: "revenue", description: "إيرادات الخدمات المهنية.", parentCode: "4000" },
    { code: "5010", name: "مشتريات / Purchases", account_type: "expense", description: "شراء مواد خام أو بضائع.", parentCode: "5000" },
    { code: "5100", name: "عمالة مباشرة / Direct Labor", account_type: "expense", description: "أجور العمال في الإنتاج.", parentCode: "5000" },
    { code: "6010", name: "رواتب وأجور / Payroll", account_type: "expense", description: "رواتب الموظفين.", parentCode: "6000" },
    { code: "6100", name: "إيجارات / Rent", account_type: "expense", description: "تكاليف المقرات.", parentCode: "6000" },
    { code: "6200", name: "مرافق / Utilities", account_type: "expense", description: "كهرباء وماء.", parentCode: "6000" },
    { code: "6500", name: "مصروف الاستهلاك / Depreciation", account_type: "expense", description: "توزيع تكلفة الأصول الثابتة.", parentCode: "6000" },
    { code: "8010", name: "إيرادات فوائد / Interest Income", account_type: "revenue", description: "عوائد الودائع البنكية.", parentCode: "8000" },
    { code: "9010", name: "مصروف فوائد / Interest Expense", account_type: "expense", description: "تكاليف الاقتراض.", parentCode: "8000" },
  ];
  return { parents, children };
}

// ──── UAE IFRS (AED) ────
function getUAECoA() {
  const parents: AccountTemplate[] = [
    { code: "1000", name: "Assets", account_type: "asset", description: "Resources controlled by the entity (IFRS)." },
    { code: "2000", name: "Liabilities", account_type: "liability", description: "Present obligations of the entity (IFRS)." },
    { code: "3000", name: "Equity", account_type: "equity", description: "Residual interest in assets after liabilities." },
    { code: "4000", name: "Revenue", account_type: "revenue", description: "Income from ordinary activities (IFRS 15)." },
    { code: "5000", name: "Cost of Sales", account_type: "expense", description: "Direct costs of goods/services sold." },
    { code: "6000", name: "Operating Expenses", account_type: "expense", description: "Administrative and selling expenses." },
    { code: "8000", name: "Other Income & Expenses", account_type: "revenue", description: "Non-operating items." },
  ];
  const children: AccountTemplate[] = [
    { code: "1010", name: "Cash and Bank Balances", account_type: "asset", description: "Cash on hand and bank deposits.", parentCode: "1000" },
    { code: "1100", name: "Trade Receivables", account_type: "asset", description: "Amounts due from customers (IFRS 9).", parentCode: "1000" },
    { code: "1200", name: "Inventories", account_type: "asset", description: "Goods held for sale (IAS 2).", parentCode: "1000" },
    { code: "1300", name: "Prepayments", account_type: "asset", description: "Advance payments for services/insurance.", parentCode: "1000" },
    { code: "1500", name: "Property, Plant & Equipment", account_type: "asset", description: "Tangible non-current assets (IAS 16).", parentCode: "1000" },
    { code: "1550", name: "Accumulated Depreciation", account_type: "asset", description: "Contra-asset for PP&E depreciation.", parentCode: "1000" },
    { code: "1600", name: "Right-of-Use Assets", account_type: "asset", description: "Leased assets per IFRS 16.", parentCode: "1000" },
    { code: "2010", name: "Trade Payables", account_type: "liability", description: "Amounts owed to suppliers.", parentCode: "2000" },
    { code: "2100", name: "Accrued Expenses", account_type: "liability", description: "Expenses incurred but not yet paid.", parentCode: "2000" },
    { code: "2200", name: "Contract Liabilities", account_type: "liability", description: "Deferred revenue per IFRS 15.", parentCode: "2000" },
    { code: "2500", name: "VAT Payable", account_type: "liability", description: "UAE VAT collected (5%).", parentCode: "2000" },
    { code: "2510", name: "Corporate Tax Payable", account_type: "liability", description: "UAE Corporate Tax (9% above AED 375k).", parentCode: "2000" },
    { code: "2600", name: "Lease Liabilities", account_type: "liability", description: "IFRS 16 lease obligations.", parentCode: "2000" },
    { code: "3010", name: "Share Capital", account_type: "equity", description: "Issued share capital.", parentCode: "3000" },
    { code: "3200", name: "Retained Earnings", account_type: "equity", description: "Accumulated profits.", parentCode: "3000" },
    { code: "4010", name: "Revenue from Contracts", account_type: "revenue", description: "Revenue per IFRS 15.", parentCode: "4000" },
    { code: "4020", name: "Service Revenue", account_type: "revenue", description: "Professional service income.", parentCode: "4000" },
    { code: "5010", name: "Cost of Goods Sold", account_type: "expense", description: "Direct cost of sales.", parentCode: "5000" },
    { code: "5100", name: "Direct Labor", account_type: "expense", description: "Production labor costs.", parentCode: "5000" },
    { code: "6010", name: "Employee Benefits Expense", account_type: "expense", description: "Salaries, end-of-service benefits (IAS 19).", parentCode: "6000" },
    { code: "6100", name: "Rent Expense", account_type: "expense", description: "Short-term and low-value lease payments.", parentCode: "6000" },
    { code: "6200", name: "Utilities", account_type: "expense", description: "Electricity, water, cooling.", parentCode: "6000" },
    { code: "6500", name: "Depreciation & Amortisation", account_type: "expense", description: "Non-current asset depreciation.", parentCode: "6000" },
    { code: "8010", name: "Finance Income", account_type: "revenue", description: "Interest and investment income.", parentCode: "8000" },
    { code: "9010", name: "Finance Costs", account_type: "expense", description: "Interest on borrowings.", parentCode: "8000" },
  ];
  return { parents, children };
}

// ──── EU IFRS (EUR) ────
function getEUCoA() {
  const parents: AccountTemplate[] = [
    { code: "1000", name: "Assets", account_type: "asset", description: "Resources controlled by the entity (IFRS as adopted by EU)." },
    { code: "2000", name: "Liabilities", account_type: "liability", description: "Present obligations of the entity." },
    { code: "3000", name: "Equity", account_type: "equity", description: "Residual interest in assets after deducting liabilities." },
    { code: "4000", name: "Revenue", account_type: "revenue", description: "Income from ordinary activities (IFRS 15)." },
    { code: "5000", name: "Cost of Sales", account_type: "expense", description: "Direct costs of goods and services sold." },
    { code: "6000", name: "Operating Expenses", account_type: "expense", description: "Selling, general and administrative expenses." },
    { code: "8000", name: "Other Income & Expenses", account_type: "revenue", description: "Non-operating and financial items." },
  ];
  const children: AccountTemplate[] = [
    { code: "1010", name: "Cash and Cash Equivalents", account_type: "asset", description: "Bank balances and short-term deposits.", parentCode: "1000" },
    { code: "1100", name: "Trade Receivables", account_type: "asset", description: "Amounts due from customers (IFRS 9).", parentCode: "1000" },
    { code: "1200", name: "Inventories", account_type: "asset", description: "Goods for sale (IAS 2).", parentCode: "1000" },
    { code: "1300", name: "Prepayments & Accrued Income", account_type: "asset", description: "Advance payments and accrued revenue.", parentCode: "1000" },
    { code: "1500", name: "Property, Plant & Equipment", account_type: "asset", description: "Tangible non-current assets (IAS 16).", parentCode: "1000" },
    { code: "1550", name: "Accumulated Depreciation", account_type: "asset", description: "Contra-asset for PP&E.", parentCode: "1000" },
    { code: "1600", name: "Right-of-Use Assets", account_type: "asset", description: "Leased assets (IFRS 16).", parentCode: "1000" },
    { code: "1700", name: "Intangible Assets", account_type: "asset", description: "Software, patents, goodwill (IAS 38).", parentCode: "1000" },
    { code: "2010", name: "Trade Payables", account_type: "liability", description: "Amounts owed to suppliers.", parentCode: "2000" },
    { code: "2100", name: "Accruals & Deferred Income", account_type: "liability", description: "Expenses due and deferred revenue.", parentCode: "2000" },
    { code: "2300", name: "Borrowings", account_type: "liability", description: "Bank loans and credit facilities.", parentCode: "2000" },
    { code: "2500", name: "VAT Payable", account_type: "liability", description: "EU Value Added Tax collected.", parentCode: "2000" },
    { code: "2510", name: "Corporate Income Tax Payable", account_type: "liability", description: "Income tax liability (IAS 12).", parentCode: "2000" },
    { code: "2600", name: "Lease Liabilities", account_type: "liability", description: "IFRS 16 lease obligations.", parentCode: "2000" },
    { code: "3010", name: "Share Capital", account_type: "equity", description: "Issued and paid-up capital.", parentCode: "3000" },
    { code: "3100", name: "Share Premium", account_type: "equity", description: "Amount received above par value.", parentCode: "3000" },
    { code: "3200", name: "Retained Earnings", account_type: "equity", description: "Cumulative net profit retained.", parentCode: "3000" },
    { code: "4010", name: "Revenue from Contracts", account_type: "revenue", description: "Revenue per IFRS 15.", parentCode: "4000" },
    { code: "4020", name: "Service Revenue", account_type: "revenue", description: "Professional service income.", parentCode: "4000" },
    { code: "5010", name: "Cost of Goods Sold", account_type: "expense", description: "Direct costs.", parentCode: "5000" },
    { code: "5100", name: "Direct Labor", account_type: "expense", description: "Production labor.", parentCode: "5000" },
    { code: "6010", name: "Employee Benefits Expense", account_type: "expense", description: "Salaries, social charges, pensions (IAS 19).", parentCode: "6000" },
    { code: "6100", name: "Rent & Occupancy Costs", account_type: "expense", description: "Office and facility costs.", parentCode: "6000" },
    { code: "6200", name: "Utilities", account_type: "expense", description: "Electricity, gas, water.", parentCode: "6000" },
    { code: "6500", name: "Depreciation & Amortisation", account_type: "expense", description: "Non-current asset costs.", parentCode: "6000" },
    { code: "8010", name: "Finance Income", account_type: "revenue", description: "Interest and investment returns.", parentCode: "8000" },
    { code: "9010", name: "Finance Costs", account_type: "expense", description: "Interest on borrowings.", parentCode: "8000" },
  ];
  return { parents, children };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { companyName, userId, currency } = await req.json();

    if (!companyName || !userId) {
      return new Response(
        JSON.stringify({ error: "companyName and userId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const selectedCurrency = currency || "USD";

    // Create tenant with the selected currency
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({ name: companyName, default_currency: selectedCurrency })
      .select("id")
      .single();

    if (tenantError) throw tenantError;

    // Assign user as owner
    const { error: roleError } = await supabaseAdmin
      .from("user_tenant_roles")
      .insert({
        user_id: userId,
        tenant_id: tenant.id,
        role: "owner",
      });

    if (roleError) throw roleError;

    // Create free trial subscription
    const { data: freePlan } = await supabaseAdmin
      .from("plans")
      .select("id")
      .eq("name", "Free Trial")
      .single();

    if (freePlan) {
      await supabaseAdmin.from("subscriptions").insert({
        tenant_id: tenant.id,
        plan_id: freePlan.id,
        status: "trialing",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Seed localized chart of accounts
    const { parents, children } = getChartOfAccounts(selectedCurrency);

    const { data: insertedParents, error: parentError } = await supabaseAdmin
      .from("chart_of_accounts")
      .insert(parents.map((a) => ({ ...a, tenant_id: tenant.id, created_by: userId })))
      .select("id, code");

    if (parentError) throw parentError;

    const parentMap: Record<string, string> = {};
    (insertedParents ?? []).forEach((p: { id: string; code: string }) => {
      parentMap[p.code] = p.id;
    });

    await supabaseAdmin.from("chart_of_accounts").insert(
      children.map(({ parentCode, ...a }) => ({
        ...a,
        tenant_id: tenant.id,
        created_by: userId,
        parent_id: parentCode ? (parentMap[parentCode] ?? null) : null,
      }))
    );

    // Seed default permissions
    await supabaseAdmin.rpc("seed_tenant_permissions", { _tenant_id: tenant.id });

    return new Response(
      JSON.stringify({ tenantId: tenant.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating tenant:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
