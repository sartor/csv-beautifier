browser.browserAction.onClicked.addListener(convertCsvToTable);

function convertCsvToTable(){
    browser.tabs.insertCSS({
        file: '/content.css',
        allFrames: true
    }).then(() => {
        browser.tabs.executeScript({
            file: '/content.js',
            allFrames: true
        });
    });
}