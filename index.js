const cheerio = require('cheerio');
const fs = require('fs');
const config = require('./config.json');

const checkAndCreateDir = require('./utils/checkAndCreateDir');
const executePromisesInSequence = require('./utils/executePromisesInSequence');
const translate = require('./utils/translate');
const getLanguageName = require('./utils/getLanguageName');

const inputDir = config.inputDir || './xliff';
const outputDir = config.outputDir || './output';
const finishedDir = config.finishedDir || './finished';

const rateLimit = config.rateLimit || 3;
const intervalTime = (60 / rateLimit) * 1000;
const nodesPerRequest = config.nodesPerRequest || 5;
const maxRetries = config.maxRetries || 3;
const onlyUntranslated = config.onlyNew || false;

checkAndCreateDir(inputDir);
checkAndCreateDir(outputDir);
checkAndCreateDir(finishedDir);

const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.xliff'));
const exclude = ["5gn8a8", "9yHXB9", "6Yhm7k", "8aWHpv", "HZUQ0M", "LB0XQL", "O3IgYS", "UdxrwD", "azP1UF", "eM6s2V", "mNhKep", "o5ideK", "qPlMkk", "qua4Se", "zWju8C"]

// Create translation tasks for each file
const translationTasks = files.map(file => {
    return async () => {
        console.log(`Starting to translate file ${file}`);
        const filePath = `${inputDir}/${file}`;
        const outPath = `${outputDir}/${file}`;

        const xmlData = fs.readFileSync(filePath, 'utf8');
        
        const $ = cheerio.load(xmlData, { 
            xmlMode: true,
            decodeEntities: false
        });
        const sourceLang = getLanguageName($('file').attr('source-language'));
        const targetLang = getLanguageName($('file').attr('target-language'));
        console.log(`Source language: ${sourceLang}, Target language: ${targetLang}`);
        var stringsCount = 0

        // Split $("trans-unit") into subarrays of size nodesPerRequest
        const chunkedNodes = [];
        $("trans-unit").each(function (index) {
            const id = $(this).attr('id');
            if (exclude.some(excludedId => id.startsWith(excludedId))) return;
            if (!onlyUntranslated && $(this).find('target').html() != null) return;
            if (stringsCount % nodesPerRequest === 0) {
                chunkedNodes.push([]);
            }
            chunkedNodes[chunkedNodes.length - 1].push(this);
            stringsCount += 1;
        });

        // Define an array to store translation operation Promises
        const translationPromises = [];
        console.log(`There are ${stringsCount} items to translate`);

        chunkedNodes.forEach((nodes, index) => {
            translationPromises.push(() => {
                // Combine node content, using a special symbol "<|->" as a separator
                const combinedText = nodes
                    .map((node) => {
                        const text = $(node).find('source').html();
                        const isCdata = text.startsWith('<![CDATA[') && text.endsWith(']]>');
                        const textToTranslate = isCdata ? text.slice(9, -3) : text;
                        return textToTranslate;
                    })
                    .join('<|->');

                return translateWithRetry($, combinedText, nodes.length, sourceLang, targetLang)
                    .then((translatedTexts) => {
                        nodes.forEach((node, i) => {
                            const text = $(node).find('source').html();
                            const encolatedtext = $('<div>').text(translatedTexts[i]).html();
                            const isCdata = text.startsWith('<![CDATA[') && text.endsWith(']]>');
                            const targetlatedText = isCdata
                                ? `<![CDATA[${encolatedtext}]]>`
                                : `${encolatedtext}`;

                            // Check if target element exists, if not, create one
                            var target = $(node).find('target');
                            if (target && target.length === 0) {
                                $(node).append(`<target>${targetlatedText}</target>`);
                            } else {
                                target.html(targetlatedText);
                            }
                        });
                        fs.writeFileSync(outPath, $.xml());
                    })
                    .catch((error) => {
                        console.error(error);
                    });
            });
        });

        // Wait for all translation operations to complete
        await executePromisesInSequence(translationPromises, intervalTime).then(() => {
            // Write the translated result to the file
            fs.writeFileSync(outPath, $.xml());
            // Move the original file to the "finished" folder
            fs.renameSync(filePath, `${finishedDir}/${file}`);
        }).catch((error) => {
            console.error(error);
        });
    };
});

async function translateWithRetry($, combinedText, nodesCount, sourceLang, targetLang, retryCount = 0) {
    try {
        const translatedText = await translate(combinedText, sourceLang, targetLang);

        // Fill in the corresponding positions after splitting in the same way
        const translatedTexts = translatedText.split('<|->');

        if (translatedTexts.length !== nodesCount) {
            throw new Error('String count mismatch');
        }
        return translatedTexts;
    } catch (error) {
        console.error(`Translation failed on attempt ${retryCount + 1}: ${error.message}`);
        if (retryCount < maxRetries) {
            const retryDelay = Math.pow(2, retryCount) * 1000;
            console.log(`Retrying in ${retryDelay / 1000} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return translateWithRetry($, combinedText, nodesCount, sourceLang, targetLang, retryCount + 1);
        } else {
            console.error(`Max retries (${maxRetries}) reached. Giving up.`);
            throw error;
        }
    }
}


(async () => {
    for (const task of translationTasks) {
        await task();
    }
})();