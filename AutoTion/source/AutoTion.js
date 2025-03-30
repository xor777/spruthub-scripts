let servicesList = [];

info = {
    name: "Автоматическое управление бризером Tion по уровню CO2",
    description: "Настраивает скорость вентилятора бризера Tion на основе показаний датчика CO2",
    version: "2.0",
    author: "xor777",
    onStart: true,

    sourceServices: [HS.Thermostat],
    sourceCharacteristics: [HC.C_FanSpeed],

    options: {
        co2sensor: {
            name: {
                en: "CO2 sensor",
                ru: "Датчик CO2"
            },
            desc: {
                en: "Select CO2 sensor",
                ru: "Выберите датчик CO2"
            },
            type: "String",
            value: "",
            formType: "list",
            values: servicesList
        },
        lowCO2: {
            name: {
                en: "Low CO2 threshold (ppm)",
                ru: "Низкий порог CO2 (ppm)"
            },
            type: "Integer",
            value: 700,
            desc: {
                en: "Below this level - ventilation speed 1",
                ru: "Ниже этого уровня - скорость вентиляции 1"
            }
        },
        mediumCO2: {
            name: {
                en: "Medium CO2 threshold (ppm)",
                ru: "Средний порог CO2 (ppm)"
            },
            type: "Integer",
            value: 950,
            desc: {
                en: "Between low and medium - ventilation speed 2",
                ru: "Между низким и средним - скорость вентиляции 2"
            }
        },
        highCO2: {
            name: {
                en: "High CO2 threshold (ppm)",
                ru: "Высокий порог CO2 (ppm)"
            },
            type: "Integer",
            value: 1200,
            desc: {
                en: "Between medium and high - ventilation speed 3",
                ru: "Между средним и высоким - скорость вентиляции 3"
            }
        },
        turboThreshold: {
            name: {
                en: "CO2 level for maximum ventilation (ppm)",
                ru: "Уровень CO2 для максимальной вентиляции (ppm)"
            },
            type: "Integer",
            value: 1500,
            desc: {
                en: "Above this level - maximum speed 5",
                ru: "Выше этого уровня - максимальная скорость 5"
            }
        }
    },

    variables: {
        lastCO2: undefined,
        lastFanSpeed: undefined,
        lastUpdateTime: undefined,
        subscribed: false,
        subscribe: undefined
    }
}

let debug = false

function trigger(source, value, variables, options, context) {
    try {
        let acc = source.getAccessory()
        let model = acc.getModel ? acc.getModel() : null

        if (model != "Tion") {
            logError("Поддерживаются только бризеры Tion", source)
            return
        }
        
        if (options.co2sensor === "") {
            logError("Выберите датчик CO2. Если уже выбрали - активируйте сценарий заново", source)
            return
        }
        
        let thermostatService = null
        acc.getServices().forEach(function (service) {
            if (service.getType() == HS.Thermostat) {
                thermostatService = service
            }
        })

        if (!thermostatService) {
            logError("Не обнаружен сервис термостата", source)
            return
        }

        let fanSpeedChar = thermostatService.getCharacteristic(HC.C_FanSpeed)
        if (!fanSpeedChar) {
            logError("Не обнаружена характеристика скорости вентилятора", source)
            return
        }

        setSpeedFromCO2Sensor(source, variables, options, fanSpeedChar)

        if (!variables.subscribe || variables.subscribed != true) {
            showSubscribeMessage(options.co2sensor)
            let subscribe = Hub.subscribeWithCondition("", "", [HS.CarbonDioxideSensor, HS.AirQualitySensor], [HC.CarbonDioxideLevel], function (sensorSource, sensorValue) {
                let service = sensorSource.getService()
                let isSelected = service.getUUID() == options.co2sensor
                if (isSelected && fanSpeedChar) {
                    updateFanSpeed(sensorValue, options, fanSpeedChar, variables, source)
                }
            }, acc)
            variables.subscribe = subscribe
            variables.subscribed = true
        }
    } catch (e) {
        logError(`Ошибка настройки автоматического режима: ${e.toString()}`, source)
    }
}

function updateFanSpeed(co2Value, options, fanSpeedChar, variables, source) {
    let fanSpeed
    
    if (co2Value < options.lowCO2) {
        fanSpeed = 1 // QUIET
    } else if (co2Value < options.mediumCO2) {
        fanSpeed = 2 // LOW
    } else if (co2Value < options.highCO2) {
        fanSpeed = 3 // MEDIUM
    } else if (co2Value < options.turboThreshold) {
        fanSpeed = 4 // HIGH
    } else {
        fanSpeed = 5 // TURBO
    }
    
    if (variables.lastFanSpeed != fanSpeed) {
        fanSpeedChar.setValue(fanSpeed)
        logInfo(`Установлена скорость вентилятора: ${fanSpeed} (CO2: ${co2Value} ppm)`, source, debug)
        variables.lastFanSpeed = fanSpeed
        variables.lastCO2 = co2Value
        variables.lastUpdateTime = Date.now()
    }
}

function setSpeedFromCO2Sensor(source, variables, options, fanSpeedChar) {
    try {
        const cdata = options.co2sensor.split('.')
        const aid = cdata[0]
        const sid = cdata[1]
        let sensorAccessory = Hub.getAccessory(aid)
        
        if (!sensorAccessory) {
            logError(`Не найден датчик CO2. ID: ${options.co2sensor}`, source)
            return
        }
        
        let sensorService = sensorAccessory.getService(sid)
        if (sensorService) {
            const status = sensorAccessory.getService(HS.AccessoryInformation).getCharacteristic(HC.C_Online).getValue() == true
            if (!status) {
                logWarn(`Датчик ${getDeviceName(sensorService)} не в сети`, source)
                return
            }
            
            let co2Value
            try {
                co2Value = sensorService.getCharacteristic(HC.CarbonDioxideLevel).getValue()
            } catch (e) {
                logError(`Не удалось получить показания CO2: ${e.toString()}`, source)
                return
            }
            
            updateFanSpeed(co2Value, options, fanSpeedChar, variables, source)
        } else {
            logError(`Не найден датчик CO2. ID: ${options.co2sensor}`, source)
            return
        }

        const currentTime = Date.now()
        if (variables.lastUpdateTime && (currentTime - variables.lastUpdateTime > oneDayMs)) {
            logWarn(`Нет показаний от датчика CO2 (${getDeviceName(sensorService)}) в течении суток или более`, source)
        }
    } catch (e) {
        logError(`Не удалось получить показания с датчика ${options.co2sensor}: ${e.toString()}`, source)
    }
}

function showSubscribeMessage(sensor) {
    try {
        const cdata = sensor.split('.')
        const aid = cdata[0]
        const sid = cdata[1]
        const acc = Hub.getAccessory(aid)
        const service = acc.getService(sid)
        const accName = service.getAccessory().getName()
        const sName = service.getName()

        console.info(`Подключен датчик CO2: ${(accName == sName ? accName : accName + " " + sName)}`)
    } catch (e) {
        console.error(`Ошибка при отображении сообщения о подключении: ${e.toString()}`)
    }
}

function getDeviceName(service) {
    try {
        const acc = service.getAccessory()
        const room = acc.getRoom().getName()
        const accName = service.getAccessory().getName()
        const sName = service.getName()
        const name = room + " -> " + (accName == sName ? accName : accName + " " + sName) + " (" + service.getUUID() + ")" + (!service.isVisible() ? ". Скрыт" : "")
        return name
    } catch (e) {
        return "Неизвестное устройство"
    }
}

function logInfo(text, source, show) {
    if (show) console.info(getLogText(text, source))
}

function logWarn(text, source) {
    console.warn(getLogText(text, source))
}

function logError(text, source) {
    console.error(getLogText(text, source))
}

function getLogText(text, source) {
    return `${text} | ${DEBUG_TITLE} ${getDeviceName(source.getService())}`
}

let servicesListUnsort = []
Hub.getAccessories().forEach(function (a) {
    a.getServices().filter(function (s) { 
        return s.getType() == HS.CarbonDioxideSensor || s.getType() == HS.AirQualitySensor 
    }).forEach(function (s) {
        try {
            const c = s.getCharacteristic(HC.CarbonDioxideLevel)
            if (!c) return
            let displayname = getDeviceName(s)
            servicesListUnsort.push({
                name: { ru: displayname, en: displayname },
                value: s.getUUID()
            })
        } catch (e) {
            console.warn(`Ошибка при добавлении датчика в список: ${e.toString()}`)
        }
    })
})

servicesList.push({ name: { ru: "Не выбрано", en: "Not selected" }, value: '' })
servicesListUnsort.sort(function (a, b) { return a.name.ru.localeCompare(b.name.ru) }).forEach(function (s) { servicesList.push(s) })

const oneDayMs = 24 * 60 * 60 * 1000
const DEBUG_TITLE = "АвтоТион: " 