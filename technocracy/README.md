# Technocracy — технологическая сборка для Minecraft 1.20.1

Большая техно-сборка на **Forge 1.20.1**: 116 основных модов, примерно 170 вместе с библиотеками. Путь игрока идёт от водяных колёс и шестерёнок Create до термоядерного синтеза, ME-сетей, полётов на Марс и Драконьего реактора.

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

- **Механика:** Create и 16 аддонов (поезда, дизельные двигатели, бурение жил, артиллерия, автозачарование, чанклоадеры для поездов).
- **Индустрия:** Thermal (7 модулей), Immersive Engineering и Petroleum, Industrial Foregoing, PneumaticCraft, Ender IO.
- **Атом и энергия:** Mekanism (5 модулей вместе с Mekanism Extras), Extreme Reactors, NuclearCraft Neoteric, Powah, Solar Flux, Flux Networks.
- **Хранилища:** AE2 с ExtendedAE, MEGA Cells, ME Requester, беспроводными терминалами и Applied Mekanistics; Functional и Sophisticated Storage, Ender Storage.
- **Логистика:** Integrated Dynamics (4 модуля), XNet, Super Factory Manager, LaserIO, Modular Routers, Pipez.
- **RFTools:** строитель и квари, телепорты, энергия, программируемые процессоры.
- **Компьютеры:** CC: Tweaked, Advanced Peripherals.
- **Автоматизация ресурсов:** Mystical Agriculture и Agradditions, Productive Bees, Botany Pots, Hostile Neural Networks.
- **Транспорт:** Valkyrien Skies с Eureka (корабли из блоков), Immersive Aircraft, Iron Jetpacks.
- **Космос и эндгейм:** Ad Astra, Draconic Evolution, Extended Crafting.
- **Удобство:** JEI с JER, Jade, Polymorph, карты Xaero, Waystones, Corpse, Torchmaster, FTB Chunks/Teams/Ultimine, автобэкапы.
- **Производительность:** Embeddium, Oculus (шейдеры), ModernFix, FerriteCore, Canary, EntityCulling, ImmediatelyFast, spark.

### Проверка модов

Slug каждого мода сверены с CurseForge, и для каждого подтверждено, что есть версия под Forge 1.20.1. Исключение — два мода, помеченные в `mods.list` знаком «?»: Mining Gadgets и Mob Grinding Utils. Для них явного подтверждения не нашлось; если версии нет, `install-mods.sh` сообщит об этом в конце.

Совместимость модов друг с другом в запуске не проверялась. Больше всего рисков в связке Valkyrien Skies + Create и в аддонах Create: им нужна версия под Create 6. Если игра падает при запуске, сначала уберите эти моды командой `packwiz remove <slug>`.

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
