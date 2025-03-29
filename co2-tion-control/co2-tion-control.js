info = {
    name: "Управление вентилятором Тиона в зависимости от уровня CO2",
    description: "Установка скорости вентилятора Тиона в зависимости от уровня CO2",
    version: "1.5",
    author: "xor777",
    onStart: false,
    
    options: {
        lowCO2: {
            name: {
                en: "Low CO2 threshold (ppm)",
                ru: "Низкий порог CO2 (ppm)"
            },
            type: "Integer",
            value: 700,
            description: {
                en: "Below this level - minimum ventilation",
                ru: "Ниже этого уровня - минимальная вентиляция"
            }
        },
        mediumCO2: {
            name: {
                en: "Medium CO2 threshold (ppm)",
                ru: "Средний порог CO2 (ppm)"
            },
            type: "Integer",
            value: 950,
            description: {
                en: "Medium level - moderate ventilation",
                ru: "Средний уровень - умеренная вентиляция"
            }
        },
        highCO2: {
            name: {
                en: "High CO2 threshold (ppm)",
                ru: "Высокий порог CO2 (ppm)"
            },
            type: "Integer",
            value: 1200,
            description: {
                en: "Above this level - intensive ventilation",
                ru: "Выше этого уровня - интенсивная вентиляция"
            }
        },
        turboThreshold: {
            name: {
                en: "CO2 level for maximum ventilation (ppm)",
                ru: "Уровень CO2 для максимальной вентиляции (ppm)"
            },
            type: "Integer",
            value: 1500,
            description: {
                en: "Above this level - maximum ventilation",
                ru: "Выше этого уровня - максимальная вентиляция"
            }
        }
    }
}

function trigger(source, value, variables, options) {
    try {
        var co2Accessory = source.getAccessory();
        if (!co2Accessory) {
            log.error("Не удалось получить аксессуар датчика CO2");
            return;
        }
        
        var co2Room = co2Accessory.getRoom();
        if (!co2Room) {
            log.error("Не удалось определить комнату датчика CO2");
            return;
        }
        
        log.info("Изменение уровня CO2: {} ppm в комнате [{}]", value, co2Room.getName());
        
        var fanSpeed;
        if (value < options.lowCO2) {
            fanSpeed = 1;
        } else if (value < options.mediumCO2) {
            fanSpeed = 2;
        } else if (value < options.highCO2) {
            fanSpeed = 3;
        } else if (value < options.turboThreshold) {
            fanSpeed = 4;
        } else {
            fanSpeed = 5;
        }
        
        log.info("Ставим скорость на: {}", fanSpeed);
        
        var accessories = co2Room.getAccessories();
        var tionCount = 0;
        
        for (var j = 0; j < accessories.length; j++) {
            var acc = accessories[j];
            
            try {
                var model = acc.getModel ? acc.getModel() : null;
                if (model !== "Tion") continue;
                
                var thermostatService = null;
                var services = acc.getServices();
                
                for (var k = 0; k < services.length; k++) {
                    if (services[k].getType() === HS.Thermostat) {
                        thermostatService = services[k];
                        break;
                    }
                }
                
                if (!thermostatService) continue;
                
                var fanSpeedChar = thermostatService.getCharacteristic(HC.C_FanSpeed);
                if (!fanSpeedChar) {
                    log.warn("У бризера Tion [{}] не найдена характеристика C_FanSpeed", acc.getName());
                    continue;
                }
                
                fanSpeedChar.setValue(fanSpeed);
                log.info("Бризер Tion [{}]: установлена скорость {}", acc.getName(), fanSpeed);
                tionCount++;
                
            } catch (e) {
                log.error("Ошибка при обработке устройства [{}]: {}", acc.getName(), e.message);
            }
        }
        
    } catch (e) {
        log.error("Ошибка: {}", e.message);
    }
} 