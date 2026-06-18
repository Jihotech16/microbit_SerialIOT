const DEVICE_ID = "device01"

serial.redirectToUSB()

function getLightStatus(light: number): string {
    if (light < 60) {
        return "dark"
    }

    if (light < 180) {
        return "good"
    }

    return "bright"
}

function showStatusIcon(status: string): void {
    if (status == "dark") {
        basic.showIcon(IconNames.Sad)
    } else if (status == "good") {
        basic.showIcon(IconNames.Happy)
    } else {
        basic.showIcon(IconNames.Surprised)
    }
}

function sendPlantData(action: string): void {
    const light = input.lightLevel()
    const status = getLightStatus(light)
    const message = "{" +
        "\"device\":\"" + DEVICE_ID + "\"," +
        "\"light\":" + light + "," +
        "\"status\":\"" + status + "\"," +
        "\"action\":\"" + action + "\"" +
        "}"

    serial.writeLine(message)
    showStatusIcon(status)
}

input.onButtonPressed(Button.A, function () {
    sendPlantData("water")
})

input.onButtonPressed(Button.B, function () {
    sendPlantData("check")
})

basic.forever(function () {
    sendPlantData("auto")
    basic.pause(5000)
})
