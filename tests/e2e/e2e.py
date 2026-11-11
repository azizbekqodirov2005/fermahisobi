# Brauzer (UI) end-to-end testi — Playwright (Python) bilan.
# Ishga tushirish: README.md dagi "Brauzer testi" bo'limiga qarang. Bo'sh (yangi) ma'lumotlar bazasi talab qilinadi.

import re, sys, json
from playwright.sync_api import sync_playwright, expect, Locator

def _vis(self, **kw):
    try:
        self.first.wait_for(state='visible', timeout=3500); return True
    except Exception:
        return False
Locator.is_visible = _vis

import os
BASE = os.environ.get('BASE_URL', 'http://localhost:3001')
PASSWORD = os.environ.get('APP_PASSWORD', 'sinov123')
OUT = os.environ.get('E2E_OUT', '.')
results = []
errors = []

def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1366, 'height': 900}, locale='uz-UZ')
    page = ctx.new_page()
    page.set_default_timeout(8000)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)

    def toast_text():
        return page.locator('[role=status]').all_inner_texts()

    # ---------- 1. login
    page.goto(BASE)
    expect(page.get_by_role('button', name='Kirish')).to_be_visible()
    page.get_by_label('Parol').fill('xato-parol')
    page.get_by_role('button', name='Kirish').click()
    check('login: noto‘g‘ri parol rad etiladi', page.get_by_text('Parol noto‘g‘ri').is_visible())
    page.get_by_label('Parol').fill(PASSWORD)
    page.get_by_role('button', name='Kirish').click()
    expect(page.get_by_role('heading', name='Bosh sahifa')).to_be_visible()
    check('login: to‘g‘ri parol bilan kirildi', True)
    check('dashboard: narx kiritilmagan ogohlantirishi', page.get_by_text('hali kiritilmagan').first.is_visible())
    check('dashboard: bo‘sh holat (mol yo‘q)', page.get_by_text('Boshlash uchun mollarni qo‘shing').is_visible())

    # ---------- 2. narxlar
    page.get_by_role('link', name='Narxlar va sozlamalar').first.click()
    expect(page.get_by_role('heading', name='Narxlar va sozlamalar')).to_be_visible()
    cards = page.locator('section')
    milk_card = cards.filter(has_text='Sut sotish narxi').first
    milk_card.get_by_label('Yangi narx').fill('5000')
    milk_card.get_by_role('button', name='Narxni saqlash').click()
    expect(page.get_by_text('Narx saqlandi').first).to_be_visible()
    feed_card = cards.filter(has_text='Yemish narxi (1 kg)').first
    feed_card.get_by_label('Yangi narx').fill('2000')
    feed_card.get_by_role('button', name='Narxni saqlash').click()
    page.wait_for_timeout(800)
    check('narxlar: sut 5 000 va yemish 2 000 saqlandi', milk_card.get_by_text('5 000').first.is_visible() and feed_card.get_by_text('2 000').first.is_visible())
    page.screenshot(path=f'{OUT}/settings.png', full_page=True)

    # ---------- 3. mollar
    page.get_by_role('link', name='Mollar', exact=True).first.click()
    expect(page.get_by_text('Hali mol qo‘shilmagan')).to_be_visible()
    check('mollar: bo‘sh holat ko‘rinadi', True)
    page.get_by_role('button', name='Mol qo‘shish').first.click()
    page.get_by_role('button', name='Qo‘shish', exact=True).click()
    check('mollar: bo‘sh forma validatsiyasi (raqam)', page.get_by_text('Mol raqamini (birka) kiriting').is_visible())
    check('mollar: bo‘sh forma validatsiyasi (nom)', page.get_by_text('Mol nomini kiriting').is_visible())
    page.get_by_label('Mol raqami (birka)').fill('101')
    page.get_by_label('Mol nomi (laqabi)').fill('Boychechak')
    page.locator('input[name=birthDate]').fill('2023-05-10')
    page.get_by_label('Kunlik yemish miqdori (kg)').fill('-3')
    page.get_by_role('button', name='Qo‘shish', exact=True).click()
    check('mollar: manfiy yemish miqdori rad etiladi', page.get_by_text('Qiymat manfiy bo‘lishi mumkin emas').is_visible())
    page.get_by_label('Kunlik yemish miqdori (kg)').fill('12,5')
    page.get_by_role('button', name='Qo‘shish', exact=True).click()
    expect(page.get_by_text('Yangi mol qo‘shildi').first).to_be_visible()
    check('mollar: birinchi mol qo‘shildi', page.get_by_role('link', name='Boychechak').is_visible())

    page.get_by_role('button', name='Mol qo‘shish').first.click()
    page.get_by_label('Mol raqami (birka)').fill('25')
    page.get_by_label('Mol nomi (laqabi)').fill('Oqqosh')
    page.get_by_text('Yoshini o‘zim kiritaman').click()
    page.get_by_label('Yosh (yil)').fill('4')
    page.get_by_label('Oy (0–11)').fill('2')
    page.get_by_label('Kunlik yemish miqdori (kg)').fill('10')
    page.get_by_role('button', name='Qo‘shish', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_text('Yangi mol qo‘shildi').first).to_be_visible()

    page.get_by_role('button', name='Mol qo‘shish').first.click()
    page.get_by_label('Mol raqami (birka)').fill('101')
    page.get_by_label('Mol nomi (laqabi)').fill('Takror')
    page.locator('input[name=birthDate]').fill('2024-01-01')
    page.get_by_role('button', name='Qo‘shish', exact=True).click()
    page.wait_for_timeout(600)
    check('mollar: takroriy raqam rad etiladi', page.get_by_text('allaqachon mavjud').first.is_visible())
    page.get_by_role('button', name='Bekor qilish').click()
    check('mollar: faol mollar soni 2', page.get_by_text('Faol mollar: 2').is_visible())
    rows = page.locator('tbody tr')
    check('mollar: raqam bo‘yicha saralash (25 < 101)', rows.nth(0).inner_text().startswith('25'), rows.nth(0).inner_text()[:20])
    page.get_by_placeholder('Nomi yoki raqami bo‘yicha qidirish').fill('oqq')
    page.wait_for_timeout(700)
    check('mollar: qidiruv (oqq -> 1 ta)', page.locator('tbody tr').count() == 1)
    page.get_by_placeholder('Nomi yoki raqami bo‘yicha qidirish').fill('')
    page.wait_for_timeout(700)
    page.screenshot(path=f'{OUT}/animals.png', full_page=True)

    # mol profili
    page.get_by_role('link', name='Boychechak').click()
    expect(page.get_by_text('Mol ma’lumotlari')).to_be_visible()
    check('profil: yosh avtomatik hisoblandi (3 yosh)', page.get_by_text(re.compile(r'3 yosh \d+ oy')).first.is_visible())
    page.go_back()

    # ---------- 4. sut
    page.get_by_role('link', name='Sut hisobi').first.click()
    expect(page.get_by_role('heading', name='Sut hisobi')).to_be_visible()
    check('sut: sut narxi (5 000 so\'m / L) ko‘rinadi', page.get_by_text('Sut narxi:').first.is_visible() and page.get_by_text('5 000 so\'m / L').first.is_visible())
    page.get_by_role('button', name='Sut kiritish').first.click()
    page.get_by_role('button', name='Saqlash', exact=True).click()
    check('sut: mol tanlanmasa xabar chiqadi', page.get_by_text('Tanlang').first.is_visible())
    page.locator('select[name=animalId]').select_option(label='Boychechak (101)')
    page.get_by_label('Ertalab (L)').fill('-2')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    check('sut: manfiy qiymat rad etiladi', page.get_by_text('Qiymat manfiy bo‘lishi mumkin emas').is_visible())
    page.get_by_label('Ertalab (L)').fill('10,5')
    page.get_by_label('Kechqurun (L)').fill('8,25')
    page.get_by_label('Qo‘shimcha sog‘im (L)').fill('2')
    check('sut: kunlik jami avtomatik (20,75 L)', page.get_by_text('20,75 L').first.is_visible())
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('Sut yozuvi saqlandi').first).to_be_visible()
    page.wait_for_timeout(600)
    check('sut: yozuv jadvalda 20,75 L', page.locator('tbody').get_by_text('20,75 L').first.is_visible())

    # takroriy
    page.get_by_role('button', name='Sut kiritish').first.click()
    page.locator('select[name=animalId]').select_option(label='Boychechak (101)')
    page.get_by_label('Ertalab (L)').fill('5')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    page.wait_for_timeout(800)
    check('sut: takroriy yozuv to‘siladi va tahrirlash taklif qilinadi', page.get_by_text('Takroriy yozuv yaratilmaydi').is_visible())
    page.get_by_role('button', name='Mavjud yozuvni tahrirlash').click()
    page.get_by_label('Qo‘shimcha sog‘im (L)').fill('0')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('Sut yozuvi yangilandi').first).to_be_visible()
    page.wait_for_timeout(600)
    check('sut: tahrirlangach jami qayta hisoblandi (18,75 L)', page.locator('tbody').get_by_text('18,75 L').first.is_visible())

    # kunlik jadval
    page.get_by_role('tab', name=re.compile('Kunlik jadval')).click()
    expect(page.get_by_text('Oqqosh')).to_be_visible()
    page.get_by_label('Oqqosh m').fill('9')
    page.get_by_label('Oqqosh e').fill('7,5')
    page.get_by_role('button', name='Hammasini saqlash').click()
    expect(page.get_by_text('mol uchun sut saqlandi').first).to_be_visible()
    page.get_by_role('tab', name='Yozuvlar').click()
    page.wait_for_timeout(700)
    check('sut: jadval orqali kiritilgan yozuv ko‘rinadi', page.locator('tbody').get_by_text('16,5 L').first.is_visible())
    check('sut: jami (18,75 + 16,5 = 35,25 L) ikki marta sanalmagan', page.get_by_text('35,25 L').first.is_visible())
    page.screenshot(path=f'{OUT}/milk.png', full_page=True)

    # ---------- 5. yemish
    page.get_by_role('link', name='Yemish hisobi').first.click()
    expect(page.get_by_role('heading', name='Yemish hisobi')).to_be_visible()
    # yem turlari katalogi
    page.get_by_role('button', name='Yem turlari va narxlari').click()
    for nm, pr in [('Pichan', '2000'), ('Silos', '500')]:
        page.get_by_label('Yangi yem turi nomi').fill(nm)
        page.get_by_label('Yangi yem 1 kg narxi').fill(pr)
        page.get_by_role('button', name='Qo‘shish', exact=True).click()
        page.wait_for_timeout(900)
    check('yem turlari: Pichan va Silos katalogga qo‘shildi', page.get_by_label('Yem turi nomi', exact=True).count() == 2)
    page.get_by_label('Yangi yem turi nomi').fill('pichan')
    page.get_by_label('Yangi yem 1 kg narxi').fill('1')
    page.get_by_role('button', name='Qo‘shish', exact=True).click()
    page.wait_for_timeout(700)
    check('yem turlari: bir xil nom rad etiladi', page.get_by_text('Bu nomli yem turi allaqachon bor').first.is_visible())
    page.get_by_text('Yopish', exact=True).click()
    page.wait_for_timeout(300)

    # ratsion: ikkala molga Pichan 9,5 kg x 2000
    page.get_by_role('button', name='Yemish kiritish').first.click()
    page.wait_for_timeout(1000)
    page.get_by_label('Hammasini tanlash').check()
    page.get_by_role('button', name='+ Pichan').click()
    check('yemish: katalogdan narx avtomatik (2000)', page.get_by_label('1 kg narxi').input_value() == '2000')
    page.get_by_label('Kg', exact=True).fill('9,5')
    page.wait_for_timeout(300)
    check('yemish: jami 19 kg va 38 000 so‘m (2 ta mol)', page.get_by_text('19 kg').first.is_visible() and page.get_by_text('38 000 so\'m').first.is_visible())
    page.screenshot(path=f'{OUT}/feed-modal.png')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('2 ta yemish yozuvi saqlandi').first).to_be_visible()
    page.wait_for_timeout(700)
    LIST = 'table:has(button[aria-label=Tahrirlash]) tbody tr'
    check('yemish: jadvalda 2 qator', page.locator(LIST).count() == 2)
    check('yemish: yem turlari bo‘yicha jadval ko‘rinadi', page.get_by_text('Yem turlari bo‘yicha').first.is_visible())

    # takroriy kiritish ikki marta hisoblanmaydi
    page.get_by_role('button', name='Yemish kiritish').first.click()
    page.wait_for_timeout(800)
    page.get_by_label('Hammasini tanlash').check()
    page.get_by_role('button', name='+ Pichan').click()
    page.get_by_label('Kg', exact=True).fill('5')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('0 ta yemish yozuvi saqlandi').first).to_be_visible()
    page.wait_for_timeout(700)
    check('yemish: takroriy yozuv qo‘shilmadi (hamon 2 qator)', page.locator(LIST).count() == 2)

    # bir nechta yem turi: Silos 18 kg x 500 = 9 000 (eski sanada, joriy hisobotlarga ta'sir qilmaydi)
    page.get_by_role('button', name='Yemish kiritish').first.click()
    page.wait_for_timeout(800)
    page.get_by_label('Sana').fill('2020-01-15')
    page.wait_for_timeout(600)
    page.get_by_role('checkbox', name=re.compile('Boychechak')).check()
    page.get_by_role('button', name='+ Silos').click()
    page.get_by_label('Kg', exact=True).fill('18')
    page.wait_for_timeout(300)
    check('yemish: Silos 18 kg x 500 = 9 000 so‘m', page.get_by_text('9 000 so\'m').first.is_visible())
    page.get_by_role('button', name='Yem turi qo‘shish').click()
    page.get_by_label('Yem turi', exact=True).nth(1).fill('Pichan')
    page.get_by_label('Kg', exact=True).nth(1).fill('5')
    page.wait_for_timeout(300)
    check('yemish: ikkinchi tur narxi katalogdan (2000) va bitta molga jami 19 000', page.get_by_label('1 kg narxi').nth(1).input_value() == '2000' and page.get_by_text('19 000 so\'m').first.is_visible())
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('2 ta yemish yozuvi saqlandi').first).to_be_visible()
    page.wait_for_timeout(700)

    # tahrirlash: narx faqat shu yozuvga ta'sir qiladi
    page.locator(LIST).first.get_by_role('button', name='Tahrirlash').click()
    page.get_by_label('Haqiqiy sarf (kg)').fill('13')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('Yemish yozuvi yangilandi').first).to_be_visible()
    page.wait_for_timeout(500)
    check('yemish: bugungi sarf kartasida 22,5 kg', page.get_by_text('22,5 kg').first.is_visible())

    # ---------- 6. sotuv
    page.get_by_role('link', name='Sut sotuvlari').first.click()
    expect(page.get_by_text('Sotuv yozuvlari topilmadi')).to_be_visible()
    page.get_by_role('button', name='Sut sotuvini kiritish').first.click()
    page.wait_for_timeout(700)
    page.get_by_label('Sotilgan sut (L)').fill('20')
    check('sotuv: narx avtomatik 5000, jami 100 000', page.get_by_label('1 litr narxi (so‘m)').input_value() == '5000' and page.get_by_text('100 000 so\'m').first.is_visible())
    page.get_by_label('Mijoz (ixtiyoriy)').fill('Sut zavodi')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('Sotuv saqlandi').first).to_be_visible()
    page.wait_for_timeout(600)
    check('sotuv: jadvalda 100 000 so‘m', page.locator('tbody').get_by_text('100 000 so\'m').first.is_visible())

    # ---------- 7. narx o'zgaradi -> tarixiy sotuv o'zgarmaydi
    page.get_by_role('link', name='Narxlar va sozlamalar').first.click()
    milk_card = page.locator('section').filter(has_text='Sut sotish narxi').first
    milk_card.get_by_label('Yangi narx').fill('6500')
    milk_card.get_by_role('button', name='Narxni saqlash').click()
    page.wait_for_timeout(900)
    page.get_by_role('link', name='Sut sotuvlari').first.click()
    page.wait_for_timeout(700)
    check('narx tarixi: yangi narx kiritilgach eski sotuv 100 000 qoldi', page.locator('tbody').get_by_text('100 000 so\'m').first.is_visible())

    # ---------- 8. hisobotlar
    page.get_by_role('link', name='Hisobotlar').first.click()
    expect(page.get_by_text('Kunlik o‘rtacha').first).to_be_visible()
    check('hisobot: sut statistikasi bugungi 35,25 L', page.get_by_text('35,25 L').first.is_visible())
    page.screenshot(path=f'{OUT}/reports-milk.png', full_page=True)
    page.get_by_role('button', name='Oldingi davr').click()
    page.wait_for_timeout(700)
    check('hisobot: oldingi haftaga o‘tildi (jami 0 L)', page.get_by_text('Bu davrda sut yozuvi yo‘q').first.is_visible())
    page.get_by_role('button', name='Keyingi davr').click()
    page.get_by_role('tab', name='Moliyaviy hisobot').click()
    page.wait_for_timeout(900)
    check('moliya: sotuv daromadi 100 000', page.get_by_text('100 000 so\'m').first.is_visible())
    check('moliya: yemish xarajati 45 000 (13·2000 + 9,5·2000)', page.get_by_text('45 000 so\'m').first.is_visible())
    check('moliya: balans 55 000 va "sof foyda emas"', page.get_by_text('55 000 so\'m').first.is_visible() and page.get_by_text('sof foyda emas').first.is_visible())
    page.screenshot(path=f'{OUT}/reports-finance.png', full_page=True)
    page.get_by_role('tab', name='Qo‘shimcha xarajatlar').click()
    page.get_by_role('button', name='Xarajat kiritish').first.click()
    page.get_by_label('Summa (so‘m)').fill('15000')
    page.get_by_label('Xarajat turi').fill('Veterinariya')
    page.get_by_role('button', name='Saqlash', exact=True).click()
    expect(page.get_by_text('Xarajat saqlandi').first).to_be_visible()
    page.get_by_role('tab', name='Moliyaviy hisobot').click()
    page.wait_for_timeout(900)
    check('moliya: xarajatdan keyingi qoldiq 40 000', page.get_by_text('40 000 so\'m').first.is_visible())

    # ---------- 9. dashboard
    page.get_by_role('link', name='Bosh sahifa').first.click()
    page.wait_for_timeout(1200)
    body = page.inner_text('body')
    check('dashboard: bugungi sut 35,25 L', '35,25 L' in body)
    check('dashboard: yemish sarfi 22,5 kg', '22,5 kg' in body)
    check('dashboard: yemish xarajati 45 000', '45 000' in body)
    check('dashboard: daromad 100 000 (sotuv bo‘yicha)', '100 000' in body and 'Sotuv bo‘yicha' in body)
    check('dashboard: 8 ta statistika kartasi + grafiklar', page.get_by_text('Haftalik sut').is_visible() and page.get_by_text('Mollar bo‘yicha taqqoslash').is_visible())
    page.screenshot(path=f'{OUT}/dashboard.png', full_page=True)

    # ---------- 10. refresh
    page.reload()
    page.wait_for_timeout(1500)
    check('yangilash: ma’lumotlar saqlanib qoldi', '35,25 L' in page.inner_text('body'))

    # ---------- 11. tarixi bor molni o'chirish
    page.get_by_role('link', name='Mollar', exact=True).first.click()
    page.wait_for_timeout(700)
    page.locator('tbody tr').filter(has_text='Boychechak').get_by_role('button', name='O‘chirish').click()
    check('o‘chirish: tarixi bor mol o‘chirilmaydi, nofaol taklif qilinadi', page.get_by_text('Molni o‘chirib bo‘lmaydi').is_visible())
    page.get_by_role('button', name='Nofaol qilish').click()
    expect(page.get_by_text('Mol nofaol qilindi').first).to_be_visible()
    page.get_by_role('link', name='Sut hisobi').first.click()
    page.wait_for_timeout(800)
    check('nofaol mol: tarixiy sut yozuvlari saqlanib qoldi', page.locator('tbody').get_by_text('Boychechak').count() >= 1)

    # ---------- 12. mobil
    mctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, locale='uz-UZ')
    mp = mctx.new_page(); mp.set_default_timeout(8000)
    mp.on('pageerror', lambda e: errors.append(f'mobile pageerror: {e}'))
    mp.goto(BASE)
    mp.get_by_label('Parol').fill(PASSWORD); mp.get_by_role('button', name='Kirish').click()
    expect(mp.get_by_role('heading', name='Bosh sahifa')).to_be_visible()
    mp.wait_for_timeout(1200)
    overflow = mp.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')
    check('mobil: gorizontal skroll yo‘q (dashboard)', not overflow)
    check('mobil: pastki navigatsiya ko‘rinadi', mp.get_by_label('Tezkor menyu').is_visible())
    mp.screenshot(path=f'{OUT}/mobile-dashboard.png')
    for path, name in [('/mollar', 'mollar'), ('/sut', 'sut'), ('/yemish', 'yemish'), ('/sotuvlar', 'sotuvlar'), ('/hisobotlar', 'hisobotlar'), ('/sozlamalar', 'sozlamalar')]:
        mp.goto(BASE + path); mp.wait_for_timeout(1200)
        ov = mp.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')
        check(f'mobil: gorizontal skroll yo‘q ({name})', not ov)
    mp.goto(BASE + '/sut?new=1'); mp.wait_for_timeout(900)
    mp.screenshot(path=f'{OUT}/mobile-milk-modal.png')
    check('mobil: ?new=1 forma ochadi', mp.get_by_role('dialog').is_visible())
    mp.get_by_role('button', name='Yopish').first.click()
    mp.get_by_role('button', name='Yana').click()
    check('mobil: yon menyu barcha 7 bo‘limni ko‘rsatadi', mp.get_by_role('dialog', name='Menyu').get_by_role('link').count() == 7)
    mp.screenshot(path=f'{OUT}/mobile-menu.png')

    print('\nRUNTIME ERRORS:', json.dumps(errors, ensure_ascii=False, indent=1) if errors else 'none')
    browser.close()

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
if failed: print('FAILED:', failed)
sys.exit(1 if failed or errors else 0)
