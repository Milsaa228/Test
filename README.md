# Проекты

Общий репозиторий проектов, созданных с Claude Code. Каждый проект лежит в своей папке и имеет собственный README.

| Папка | Описание | Стек |
|---|---|---|
| [`tbank-expenses`](tbank-expenses/) | Статистика расходов по данным Т-Банка (импорт CSV-выписки, Т-Бизнес API) и «Двойник»: прогноз до зарплаты, подписки, чат с Claude о финансах | Expo / React Native, TypeScript, Claude API |
| [`split-bill`](split-bill/) | Делёжка счёта: фото чека → Claude разбирает позиции → кто что ел → сообщение друзьям с суммами | Expo / React Native, TypeScript, Claude API |
| [`fridge-chef`](fridge-chef/) | Холодильник-шеф: продукты по фото, сроки годности с напоминаниями, рецепты из того, что есть | Expo / React Native, TypeScript, Claude API |
| [`geo-notes`](geo-notes/) | Гео-заметки: заметка, привязанная к месту, всплывает, когда вы рядом; обмен заметками ссылкой | Expo / React Native, TypeScript, expo-location |

Функции с Claude требуют своего API-ключа (console.anthropic.com), он вводится в настройках приложения и хранится на устройстве.
