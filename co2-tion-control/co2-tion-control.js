info = {
    name: "Управление вентилятором Тиона в зависимости от уровня CO2",
    description: "Установка скорости вентилятора Тиона в зависимости от уровня CO2",
    version: "1.3",
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
        log.info("Сработал триггер CO2, значение: {}", value);
        
        var co2Room = null;
        try {
            var co2Accessory = source.getAccessory();
            if (co2Accessory) {
                co2Room = co2Accessory.getRoom();
                if (co2Room) {
                    log.info("Датчик CO2 находится в комнате: [{}]", co2Room.getName());
                } else {
                    log.error("Не удалось определить комнату датчика CO2");
                    return;
                }
            } else {
                log.error("Не удалось получить аксессуар датчика CO2");
                return;
            }
        } catch (e) {
            log.error("Ошибка при определении комнаты датчика CO2: {}", e.message);
            return;
        }

        var fanSpeed;
        
        if (value < options.lowCO2) {
            fanSpeed = 1;
            log.info("Минимальный уровень CO2: {}, скорость: {}", value, fanSpeed);
        } else if (value < options.mediumCO2) {
            fanSpeed = 2;
            log.info("Низкий уровень CO2: {}, скорость: {}", value, fanSpeed);
        } else if (value < options.highCO2) {
            fanSpeed = 3;
            log.info("Средний уровень CO2: {}, скорость: {}", value, fanSpeed);
        } else if (value < options.turboThreshold) {
            fanSpeed = 4;
            log.info("Высокий уровень CO2: {}, скорость: {}", value, fanSpeed);
        } else {
            fanSpeed = 5;
            log.info("Максимальный уровень CO2: {}, скорость: {} - ТУРБО", value, fanSpeed);
        }

        var accessories = co2Room.getAccessories();
        var thermostatFound = false;
        
        for (var j = 0; j < accessories.length; j++) {
            var acc = accessories[j];
            var services = acc.getServices();
            
            for (var k = 0; k < services.length; k++) {
                var service = services[k];
                if (service.getType() === HS.Thermostat) {
                    thermostatFound = true;
                    log.info("Найден бризер: [{}] в комнате [{}]", acc.getName(), co2Room.getName());
                    
                    try {
                        var fanSpeedChar = service.getCharacteristic(HC.C_FanSpeed);
                        if (fanSpeedChar) {
                            fanSpeedChar.setValue(fanSpeed);
                            log.info("Установлена скорость вентилятора: {}", fanSpeed);
                        } else {
                            log.error("Характеристика C_FanSpeed не найдена");
                        }
                    } catch (e) {
                        log.error("Ошибка при установке скорости: {}", e.message);
                    }
                }
            }
        }
        
        if (!thermostatFound) {
            log.warn("В комнате {} не найдено ни одного бризера", co2Room.getName());
        }
    } catch (e) {
        log.error("Ошибка: {}", e.message);
    }
} 