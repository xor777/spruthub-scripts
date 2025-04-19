let servicesList = [];

info = {
    name: "Автоматическое управление бризером Tion по уровню CO2",
    description: "Настраивает скорость вентилятора бризера Tion на основе показаний датчика CO2",
    version: "3.0",
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
        defaultFanSpeed: {
            name: { ru: "Скорость по умолчанию", en: "Default fan speed" },
            type: "Integer",
            value: 1,
            desc: { ru: "Если датчик не выбран, используется эта скорость (0 – выключить, 1‑5 – скорость)", en: "Used when sensor not selected (0 – off, 1‑5 – speed)" }
        },
        turnOffAtLowCO2: {
            name: { ru: "Выключать бризер при низком CO2", en: "Turn off at low CO2" },
            type: "Boolean",
            value: false,
            desc: { ru: "Если включено и CO2 ниже нижнего порога, бризер выключается. Иначе работает на тихой скорости.", en: "If enabled and CO2 below low threshold the fan turns off, otherwise quiet speed." }
        },
        lowCO2: {
            name: {
                en: "Low CO2 threshold (ppm)",
                ru: "Низкий порог CO2 (ppm)"
            },
            type: "Integer",
            value: 700,
            desc: {
                en: "Below this level ventilation runs at speed 1 (or turns off if \"Turn off at low CO2\" is enabled)",
                ru: "Ниже этого уровня бризер работает на скорости 1 (или выключается, если включена опция \"Выключать бризер при низком CO2\")"
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
        },
        nightLimitEnabled: {
            name: { ru: "Ограничивать скорость в ночном режиме", en: "Limit speed at night" },
            type: "Boolean",
            value: false,
            desc: { ru: "Если включено, при ночном режиме сигнализации скорость ограничивается", en: "If enabled, limit speed while in night mode" }
        },
        nightMaxSpeed: {
            name: { ru: "Макс. скорость в ночном режиме", en: "Max speed at night" },
            type: "Integer",
            value: 2,
            desc: { ru: "0 – выключить, 1-5 – ограничить скорость", en: "0 – off, 1-5 – limit speed" }
        },
        stopWhenAway: {
            name: { ru: "Ограничивать скорость в режиме 'Нет дома'", en: "Limit speed when away" },
            type: "Boolean",
            value: true,
            desc: { ru: "Если включено, при режиме 'Нет дома' скорость ограничивается", en: "If enabled, limit speed while away" }
        },
        awayMaxSpeed: {
            name: { ru: "Макс. скорость в режиме 'Нет дома'", en: "Max speed when away" },
            type: "Integer",
            value: 0,
            desc: { ru: "0 – выключить, 1-5 – ограничить скорость", en: "0 – off, 1-5 – limit speed" }
        },
        debugEnabled: {
            name: { ru: "Включить отладку", en: "Enable debug" },
            type: "Boolean",
            value: false,
            desc: { ru: "Показывать подробные сообщения в логах", en: "Show detailed logs" }
        }
    },

    variables: {
        lastCO2: undefined,
        lastFanSpeed: undefined,
        lastUpdateTime: undefined,
        subscribed: false,
        subscribe: undefined,
        securitySubscribed: false,
        securitySubscribe: undefined,
        awayActive: false,
        nightActive: false
    }
}

// debug берём из настроек

function trigger(source, value, variables, options, context) {
    try {
        let acc = source.getAccessory()
        let model = acc.getModel ? acc.getModel() : null

        if (model != "Tion") {
            logError("Поддерживаются только бризеры Tion", source)
            return
        }
        
        const sensorSelected = options.co2sensor !== ""
        
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
        let modeChar = thermostatService.getCharacteristic(HC.TargetHeatingCoolingState)
        let powerCharFallback = modeChar ? null : (thermostatService.getCharacteristic(HC.Active) || thermostatService.getCharacteristic(HC.On))
        if (!fanSpeedChar) {
            logError("Не обнаружена характеристика скорости вентилятора", source)
            return
        }

        if(sensorSelected){
            setSpeedFromCO2Sensor(source, variables, options, fanSpeedChar, modeChar, powerCharFallback)
        } else {
            // Работа без датчика: берём скорость из настройки и применяем ограничения
            let speed = options.defaultFanSpeed
            let reasons = ["значение по умолчанию"]
            if (options.nightLimitEnabled && variables.nightActive) {
                speed = Math.min(speed, options.nightMaxSpeed)
                reasons.push("ограничение ночь")
            }
            if (options.stopWhenAway && variables.awayActive) {
                speed = Math.min(options.awayMaxSpeed, speed)
                reasons.push("ограничение 'Нет дома'")
            }

            updateFanSpeed(speed===0?options.lowCO2-1:options.lowCO2+1, options, fanSpeedChar, modeChar, powerCharFallback, variables, source) // вызов с фиктивным co2 чтобы сохранить логику; передаем >lowCO2, <medium to избежать выключения внутри
            if(options.debugEnabled){
                logInfo(`Debug: без датчика, скорость=${speed} [${reasons.join(', ')}]`, source, true)
            }
        }

        // Подписка на сигнализацию
        if (options.stopWhenAway && !variables.securitySubscribed) {
            let securitySubscribe = Hub.subscribeWithCondition("", "", [HS.SecuritySystem], [HC.SecuritySystemCurrentState], function (secSource, secValue) {
                variables.awayActive = (secValue === 1)
                variables.nightActive = (secValue === 2)
                logInfo(`Сигнализация: ${securityStateToString(secValue)}`, secSource, options.debugEnabled)
                updateFanSpeed(variables.lastCO2 !== undefined ? variables.lastCO2 : 0, options, fanSpeedChar, modeChar, powerCharFallback, variables, source)
            })
            variables.securitySubscribe = securitySubscribe
            variables.securitySubscribed = true
            // Инициализация текущего статуса
            let securityService = undefined
            Hub.getAccessories().forEach(function (acc) {
                if (securityService) return
                try {
                    const srv = acc.getServices().find(function (s) { return s.getType() == HS.SecuritySystem })
                    if (srv) securityService = srv
                } catch (e) {
                    // пропускаем аксессуары без метода getServices
                }
            })
            if (securityService) {
                try {
                    let curState = securityService.getCharacteristic(HC.SecuritySystemCurrentState).getValue()
                    variables.awayActive = (curState === 1)
                    variables.nightActive = (curState === 2)
                    logInfo(`Текущий режим сигнализации: ${securityStateToString(curState)}`, securityService.getCharacteristic(HC.SecuritySystemCurrentState), options.debugEnabled)
                } catch (e) {
                    // ignore
                }
            }
        }

        if (sensorSelected && (!variables.subscribe || variables.subscribed != true)) {
            showSubscribeMessage(options.co2sensor)
            let subscribe = Hub.subscribeWithCondition("", "", [HS.CarbonDioxideSensor, HS.AirQualitySensor], [HC.CarbonDioxideLevel], function (sensorSource, sensorValue) {
                let service = sensorSource.getService()
                let isSelected = service.getUUID() == options.co2sensor
                if (isSelected && fanSpeedChar) {
                    updateFanSpeed(sensorValue, options, fanSpeedChar, modeChar, powerCharFallback, variables, source)
                }
            }, acc)
            variables.subscribe = subscribe
            variables.subscribed = true
        }
    } catch (e) {
        logError(`Ошибка настройки автоматического режима: ${e.toString()}`, source)
    }
}

function updateFanSpeed(co2Value, options, fanSpeedChar, modeChar, powerChar, variables, source) {
    let fanSpeed
    let initialSpeed
    let reasons = []
    
    if (co2Value < options.lowCO2) {
        fanSpeed = options.turnOffAtLowCO2 ? 0 : 1
        reasons.push(fanSpeed===0?"низкий CO2 (выкл)":"низкий CO2 (скорость 1)")
    } else if (co2Value < options.mediumCO2) {
        fanSpeed = 2
        reasons.push("средний CO2")
    } else if (co2Value < options.highCO2) {
        fanSpeed = 3
        reasons.push("высокий CO2")
    } else if (co2Value < options.turboThreshold) {
        fanSpeed = 4
        reasons.push("очень высокий CO2")
    } else {
        fanSpeed = 5
        reasons.push("максимальный CO2")
    }
    initialSpeed = fanSpeed

    // Ночное ограничение
    if (options.nightLimitEnabled && variables.nightActive) {
        fanSpeed = Math.min(fanSpeed, options.nightMaxSpeed)
        if (fanSpeed < initialSpeed) reasons.push("ограничение ночь")
    }

    // Остановка при отсутствии дома
    if (options.stopWhenAway && variables.awayActive) {
        fanSpeed = Math.min(options.awayMaxSpeed, fanSpeed)
        if (fanSpeed < initialSpeed) reasons.push("ограничение 'Нет дома'")
    }
    
    if (fanSpeed === 0) {
        if (variables.lastFanSpeed !== 0) {
            if (modeChar) modeChar.setValue(0)
            else if (powerChar) powerChar.setValue(0)
            let txt=`Бризер выключен (CO2: ${co2Value} ppm)`
            if(reasons.length) txt+=` [${reasons.join(', ')}]`
            logInfo(txt, source, options.debugEnabled)
            variables.lastFanSpeed = 0
            variables.lastCO2 = co2Value
            variables.lastUpdateTime = Date.now()
        }
    } else {
        if (modeChar) {
            if (modeChar.getValue() !== 2) modeChar.setValue(2)
        } else if (powerChar) {
            if (powerChar.getValue() !== 1) powerChar.setValue(1)
        }
        fanSpeedChar.setValue(fanSpeed)
        let txt=`Установлена скорость вентилятора: ${fanSpeed} (CO2: ${co2Value} ppm)`
        if(reasons.length>1) txt+=` [${reasons.slice(1).join(', ')}]`
        logInfo(txt, source, options.debugEnabled)
        variables.lastFanSpeed = fanSpeed
        variables.lastCO2 = co2Value
        variables.lastUpdateTime = Date.now()
    }
}

function setSpeedFromCO2Sensor(source, variables, options, fanSpeedChar, modeChar, powerChar) {
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
            
            updateFanSpeed(co2Value, options, fanSpeedChar, modeChar, powerChar, variables, source)
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

function securityStateToString(state) {
    switch (state) {
        case 0: return "Disarmed";
        case 1: return "Away";
        case 2: return "Night";
        case 3: return "Stay";
        case 4: return "Triggered";
        default: return `Unknown(${state})`;
    }
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