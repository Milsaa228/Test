// Альтернативные рецепты на конвейерах Create (поэтапная сборка).
// Автоматизировать поздние компоненты можно уже в эпоху пара.

ServerEvents.recipes(event => {
  const inter = 'create:incomplete_precision_mechanism'

  // Базовая схема Mekanism: электронная лампа + осмий + редстоун, 2 прохода.
  event.recipes.create.sequenced_assembly([
    Item.of('mekanism:basic_control_circuit').withChance(0.9),
    Item.of('create:electron_tube').withChance(0.1)
  ], 'create:electron_tube', [
    event.recipes.create.deploying(inter, [inter, '#forge:ingots/osmium']),
    event.recipes.create.deploying(inter, [inter, 'minecraft:redstone']),
    event.recipes.create.pressing(inter, inter)
  ]).transitionalItem(inter).loops(2)

  // Стальной слиток: смешивание железа с углём в разогретом миксере.
  event.recipes.create.mixing('mekanism:ingot_steel', [
    '#forge:ingots/iron',
    '2x minecraft:coal'
  ]).heated()
})
