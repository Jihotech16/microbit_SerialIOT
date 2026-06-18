const DEVICE_ID = "device01"
const AUTO_INTERVAL_MS = 5000
const POLL_MS = 100

serial.redirectToUSB()

let nextAction = ""

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
    basic.pause(20)
    showStatusIcon(status)
}

function waitForNextSend(): void {
    let elapsed = 0

    while (elapsed < AUTO_INTERVAL_MS) {
        if (nextAction != "") {
            return
        }

        basic.pause(POLL_MS)
        elapsed += POLL_MS
    }
}

input.onButtonPressed(Button.A, function () {
    nextAction = "water"
})

input.onButtonPressed(Button.B, function () {
    nextAction = "check"
})

basic.forever(function () {
    let action = "auto"

    if (nextAction != "") {
        action = nextAction
        nextAction = ""
    }

    sendPlantData(action)

    if (action == "auto") {
        waitForNextSend()
    } else {
        basic.pause(100)
    }
})
