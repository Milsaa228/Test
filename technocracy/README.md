# Technocracy — технологическая сборка для Minecraft 1.20.1

Большая техно-сборка на **Forge 1.20.1** (~60 основных модов, около 100 вместе с библиотеками). Путь игрока идёт от водяных колёс и шестерёнок Create до термоядерного синтеза, ME-сетей, полётов на Марс и Драконьего реактора.

Моды не разрознены: скрипты KubeJS связывают ключевые рецепты, и каждый следующий век опирается на предыдущий.

## Лестница прогрессии

| Эпоха | Моды | Что открывает следующий шаг |
|---|---|---|
| **I. Пар и механика** | Create, Steam 'n' Rails, Crafts & Additions, Big Cannons, Enchantment Industry | Точный механизм (`create:precision_mechanism`) |
| **II. Электричество** | Thermal Series, Immersive Engineering, Immersive Petroleum, Ender IO, PneumaticCraft | Рамка машин Thermal требует точный механизм |
| **III. Атомный век** | Mekanism (+Generators), Extreme Reactors, Industrial Foregoing | Металлургический инфузор собирается из латунного корпуса и механизмов Create |
| **IV. Цифровая эпоха** | Applied Energistics 2, Integrated Dynamics, CC: Tweaked, Advanced Peripherals, Powah, Flux Networks | Высекатель AE2 требует стальной корпус Mekanism, контроллер — продвинутую схему |
| **V. Космос и эндгейм** | Ad Astra, Draconic Evolution, Mystical Agriculture | Ракеты, другие планеты, Драконий реактор |

Изменённые рецепты лежат в [`kubejs/server_scripts/`](kubejs/server_scripts/):

- `progression.js` связывает эпохи между собой;
- `create_assembly.js` добавляет сборку схем Mekanism на конвейере Create и сталь из разогретого миксера.

Подсказки на ключевых предметах задаёт `kubejs/client_scripts/tooltips.js`.

Almost Unified сводит одинаковые слитки, пыль и руды разных модов к одному предмету.

## Состав

Полный список с категориями лежит в [`mods.list`](mods.list). Кратко:

- **Механика:** Create и 8 аддонов.
- **Индустрия:** Thermal (6 модулей), Immersive Engineering и Petroleum, Industrial Foregoing, PneumaticCraft, Ender IO.
- **Атом и энергия:** Mekanism (4 модуля), Extreme Reactors, Powah, Flux Networks.
- **Логистика:** AE2 с беспроводными терминалами и Applied Mekanistics, Integrated Dynamics (4 модуля), LaserIO, Modular Routers, Pipez, Functional и Sophisticated Storage.
- **Компьютеры:** CC: Tweaked, Advanced Peripherals.
- **Космос и эндгейм:** Ad Astra, Draconic Evolution.
- **Удобство:** JEI, Jade, карты Xaero, Waystones, FTB Chunks/Teams/Ultimine, Mining и Building Gadgets.
- **Производительность:** Embeddium, ModernFix, FerriteCore, EntityCulling, ImmediatelyFast, spark.

## Сборка

Сборка хранится в формате [packwiz](https://packwiz.infra.link/): в репозитории лежат только манифесты и конфиги, а jar-файлы скачиваются с CurseForge при установке.

### 1. Добавить моды (один раз)

```bash
go install github.com/packwiz/packwiz@latest   # или бинарник со страницы packwiz
cd technocracy
./install-mods.sh
```

Скрипт добавит каждый мод из `mods.list` вместе с зависимостями и обновит `index.toml`. Если какой-то slug не найдётся, скрипт выведет его в конце. Тогда найдите мод на CurseForge и добавьте вручную: `packwiz curseforge add <ссылка>`.

После этого закоммитьте появившиеся файлы `mods/*.pw.toml`.

### 2. Играть

**CurseForge App или любой лаунчер с импортом zip:**

```bash
packwiz curseforge export   # создаст Technocracy-1.0.0.zip
```

Импортируйте zip в лаунчер.

**Prism Launcher / MultiMC** (сборка обновляется сама):

1. Создайте инстанс Forge 1.20.1 / 47.3.0.
2. Положите в `.minecraft` файл [packwiz-installer-bootstrap.jar](https://github.com/packwiz/packwiz-installer-bootstrap/releases).
3. В настройках инстанса укажите Pre-launch command:
   ```
   "$INST_JAVA" -jar packwiz-installer-bootstrap.jar <URL до pack.toml>
   ```
   Для локальной сборки URL можно получить командой `packwiz serve`. Для общей — ссылкой на raw-файл `pack.toml` в репозитории.

**Сервер:** запустите `packwiz-installer-bootstrap.jar -g -s server <URL pack.toml>` в папке сервера Forge. Клиентские моды (карты, Embeddium и т.п.) пропустятся сами.

### Рекомендации

- Выделите **8 ГБ ОЗУ** (минимум 6), Java 17.
- Поиск причин лагов: `/spark profiler`.
