// Technocracy — связывание модов в единую лестницу прогрессии:
// Create (пар) → Thermal / Immersive (электричество) → Mekanism (атом) → AE2 / Powah → космос и эндгейм.

ServerEvents.recipes(event => {
  // Эпоха электричества: рамка машин Thermal требует точного механизма Create.
  event.replaceInput(
    { output: 'thermal:machine_frame' },
    'thermal:tin_gear',
    'create:precision_mechanism'
  )

  // Атомный век: металлургический инфузор Mekanism собирается из деталей Create.
  event.remove({ output: 'mekanism:metallurgic_infuser' })
  event.shaped('mekanism:metallurgic_infuser', [
    'IFI',
    'PCP',
    'IFI'
  ], {
    I: '#forge:ingots/osmium',
    F: 'minecraft:furnace',
    P: 'create:precision_mechanism',
    C: 'create:brass_casing'
  })

  // Цифровая эпоха: высекатель AE2 требует стальной корпус Mekanism.
  event.remove({ output: 'ae2:inscriber' })
  event.shaped('ae2:inscriber', [
    'SPS',
    'FCF',
    'SPS'
  ], {
    S: '#forge:ingots/steel',
    P: 'minecraft:sticky_piston',
    F: 'ae2:fluix_crystal',
    C: 'mekanism:steel_casing'
  })

  // Контроллер ME-сети — продвинутая схема Mekanism вместо обычного процессора.
  event.replaceInput(
    { output: 'ae2:controller' },
    'ae2:engineering_processor',
    'mekanism:advanced_control_circuit'
  )
})
