// Подсказки о ключевых шагах прогрессии.

ItemEvents.tooltip(event => {
  event.add('create:precision_mechanism', Text.gold('Ключ к электрической эпохе: нужен для Thermal и Mekanism'))
  event.add('mekanism:metallurgic_infuser', Text.aqua('Начало атомного века'))
  event.add('ae2:inscriber', Text.lightPurple('Требует стальной корпус Mekanism'))
  event.add('mekanism:steel_casing', Text.gray('Нужен для высекателя AE2'))
})
