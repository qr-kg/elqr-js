# elqr

> TypeScript-библиотека для сборки и парсинга платёжных ссылок
> по [спецификации ELQR]([REDACTED-INTERNAL-SPEC]) — национального QR-стандарта мгновенных
> платежей Кыргызстана.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen)

🇬🇧 **[README in English](./README.md)**

## Возможности

- ✅ Сборка и парсинг платёжных ссылок по ELQR v1.3.1
- ✅ Генерация и case-insensitive проверка SHA-256 чек-суммы
- ✅ Проверено на реальных ссылках из **MBank**, **DCB** (Simbank) и **O!Bank**
- ✅ Ноль runtime-зависимостей — используется Web Crypto (Node ≥ 20, современные браузеры)
- ✅ Строгий TypeScript, полный JSDoc, узкая публичная поверхность API
- ✅ Симметричные типы вход/выход — `amount` это `bigint` в обе стороны

## Что такое ELQR

ELQR — национальный стандарт мгновенных платежей по QR-коду в Кыргызстане, поддерживается всеми банками КР с 2022 года.
Платёжная ссылка это URL, в фрагменте которого (всё после `#`) лежит TLV-закодированная информация о получателе, сумме,
валюте и контрольной сумме. Любое банковское приложение в КР умеет открывать такую ссылку и проводить платёж.

Универсальный роутер: <https://pay.payqr.kg>

## Deep-link домены банков

По умолчанию `baseUrl` равен `https://pay.payqr.kg/` — универсальный роутер открывает любое банковское приложение в КР.
Чтобы открыть конкретный банк напрямую, передай в `baseUrl` его собственный префикс из таблицы ниже.

| Банк      | Deep-link префикс                |
|-----------|----------------------------------|
| Finik     | `https://qr.finik.kg/`           |
| MBank     | `https://app.mbank.kg/qr/`       |
| O!Деньги  | `https://api.dengi.o.kg/`        |
| Bakai     | `https://bakai.app/`             |
| Elcart    | `https://pay.payqr.kg/`          |
| DantePay  | `https://pay.payqr.kg/`          |
| Simbank   | `https://pay.payqr.kg/`          |
| MegaPay   | `https://megapay.kg/get` *       |
| Optima24  | `https://pay.payqr.kg/` *        |
| РСК24     | `https://qr.rsk.kg/` *           |
| NambaOne  | `https://nambaone.app/` *        |
| KICB      | `https://bank.kicb.net/` *       |
| АБ24      | `https://qr.ab.kg/` *            |
| DemirBank | `https://retail.demirbank.kg/` * |
| Balance   | `https://balance.kg/` *          |
| Компаньон | `https://24.kompanion.kg/qr/` *  |
| Элдик     | `https://app.eldik.kg/` *        |

\* Не подтверждён реальной production-ссылкой — если сомневаешься, используй дефолтный `https://pay.payqr.kg/`.

Некоторые префиксы заворачивают фрагмент в пустой query-параметр (`?…=#…`) — TLV всё равно живёт после `#`, парсинг
работает одинаково.

## Установка

```bash
npm install @qr.kg/elqr-js
```

Также публикуется как **`@qr-kg/elqr-js`** (совпадает с именем GitHub-организации) — идентичный код, та же версия. Можно ставить любой из них; оба обновляются одновременно при каждом релизе.

## Быстрый старт

```ts
import { buildLink, parseLink, parseLinkVerified } from "@qr.kg/elqr-js";

// Собираем платёжную ссылку. Сумма указывается в тыйнах (1 KGS = 100 тыйнов).
const url = await buildLink({
  type: "dynamic",
  service: {
    providerId: "kg.example.shop",
    serviceCode: "checkout",
    recipientId: "alice",
  },
  mcc: "5812", // ISO 18245 — точки общепита
  amount: 5000n, // 50.00 сом
  providerName: "Alice",
  comment: "Спасибо!",
});
// → "https://pay.payqr.kg/#0002010102123232..."

// Парсим без проверки чек-суммы.
const parsed = parseLink(url);
console.log(parsed.providerName, parsed.amount); // "Alice" 5000n

// Парсим и сразу верифицируем чек-сумму.
const verified = await parseLinkVerified(url); // бросит ElqrChecksumError при несовпадении
```

### Свой домен для deep-link

По умолчанию `baseUrl` равен `https://pay.payqr.kg/` (универсальный ELQR-роутер). Если нужно генерить ссылки с
собственным доменом (например, чтобы открывались напрямую в вашем приложении через registered deep-link), передай
`baseUrl` в каждом вызове или настрой билдер один раз:

```ts
// Override на каждый вызов:
const url = await buildLink(payload, { baseUrl: "https://example.com/" });

// Или настроить один раз на старте приложения:
import { createBuilder } from "@qr.kg/elqr-js";

const buildLink = createBuilder({ baseUrl: "https://example.com/" });
const url1 = await buildLink(payload);
const url2 = await buildLink(otherPayload);
```

## API

### `buildLink(payload, options?) → Promise<string>`

Собирает полный URL (`${baseUrl}#${fragment}`) с SHA-256 чек-суммой в ID 63.

```ts
function buildLink(payload: ElqrPayload, options?: BuildOptions): Promise<string>;

interface BuildOptions {
  baseUrl?: string;        // по умолчанию "https://pay.payqr.kg/"
  percentEncode?: boolean; // percent-encode non-ASCII байты для транспорта по URL
}
```

Бросает `ElqrEncodeError` при отсутствии обязательных полей или превышении лимитов спеки.

### `buildFragment(payload) → Promise<string>`

Как `buildLink`, но возвращает только TLV-фрагмент (без схемы/хоста/`#`). Полезно когда нужно зашить TLV напрямую в QR
без URL-обёртки.

### `createBuilder(defaults?) → buildLink`

Возвращает преднастроенную функцию `buildLink`. Параметры в самом вызове по-прежнему перекрывают defaults. `baseUrl`
валидируется при создании фабрики — мисконфиг падает на старте приложения, а не на первом вызове.

```ts
const buildLink = createBuilder({baseUrl: "https://example.com/", percentEncode: true});
const url = await buildLink(payload);
```

`buildFragment` не зависит от `baseUrl`, поэтому импортируется напрямую из пакета.

### `parseLink(input) → ElqrParsed`

Синхронный парсер URL или голого фрагмента. **Чек-сумму не проверяет.** Бросает `ElqrParseError` при битом TLV или
отсутствии обязательных ID.

### `parseLinkVerified(input) → Promise<ElqrParsed>`

Парсит **и** проверяет SHA-256 чек-сумму (case-insensitive). Бросает `ElqrParseError` при битом входе или
`ElqrChecksumError` при несовпадении чек-суммы.

### `verifyChecksum(input) → Promise<boolean>`

Standalone-проверка чек-суммы. Возвращает `false` при отсутствии/несовпадении чек-суммы или битом TLV — никогда не
бросает.

### Константы

```ts
import {
  SPEC_VERSION,         // "01"
  DEFAULT_CURRENCY,     // "417" (KGS)
  DEFAULT_BASE_URL,     // "https://pay.payqr.kg/"
  KGS_TYIYN_PER_UNIT,   // 100n
} from "@qr.kg/elqr-js";
```

### Ошибки

```
ElqrError                  ← базовый класс, ловит всё
├── ElqrEncodeError        ← бросается билдерами при невалидном входе
├── ElqrParseError         ← бросается парсерами при битом TLV / отсутствии ID
└── ElqrChecksumError      ← бросается parseLinkVerified при несовпадении чек-суммы
```

## Соответствие спеке

Поддерживаемые корневые ID:

| ID    | Название                      | Статус         |
|-------|-------------------------------|----------------|
| 00    | Версия                        | обязательный ✅ |
| 01    | Тип ссылки (static / dynamic) | обязательный ✅ |
| 32    | Информация о поставщике       | обязательный ✅ |
| 33    | Информация о ТСП              | опциональный ✅ |
| 34    | Комментарий                   | опциональный ✅ |
| 35-39 | Доп. поля                     | опциональный ✅ |
| 52    | MCC (ISO 18245)               | обязательный ✅ |
| 53    | Валюта (ISO 4217)             | обязательный ✅ |
| 54    | Сумма в тыйнах                | опциональный ✅ |
| 59    | Наименование поставщика       | обязательный ✅ |
| 63    | Чек-сумма SHA-256             | обязательный ✅ |

На стороне билдера применяется строгая валидация лимитов из спеки. Парсер lenient к реальным граничным случаям (
uppercase чек-суммы, `amount=0` в статических ссылках, нестандартный порядок полей у некоторых банков).

## Лицензия

[MIT](./LICENSE)
