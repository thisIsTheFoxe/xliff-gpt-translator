/**
 * The function translates text from a source language to a target language while keeping HTML code
 * intact and maintaining original website links.
 * @param text - The text that needs to be translated from the source language to the target language.
 * @param sourceLang - The source language of the text to be translated.
 * @param targetLang - The targetLang parameter is the language that the text will be translated to.
 * @returns The `translate` function is returning the translated text as a string.
 */
const axiosInstance = require('../axiosInstance');
const config = require('../config.json');

async function translate(text, sourceLang, targetLang) {
    const messages = [
        {role: "system", "content": `You have been assigned the task of translating strings for an iOS app. Translate the following texts from ${sourceLang} to ${targetLang}, while preserving any HTML code and the placeholders \`<|->\`. Do not translate URLs or other placeholders like \`\${}\`. Ensure that the translations sound natural and contextually appropriate for an iOS app.\nThe app is designed for Jehovah's Witnesses. Note that terms like 'scripture' and 'NWT' can be translated as 'bible.' Additionally, 'Daily text,' 'Yeartext,' 'convention,' 'assembly,' and 'congregation' should be interpreted based on their meanings within the context of Jehovah's Witnesses.`},
        { role: 'user', content: text },
    ];

    try {
        const response = await axiosInstance.post('', {
            messages,
            max_tokens: 8000,
            temperature: 0.8,
            model: config.openai_model,
        });

        const translatedText = response.data.choices[0].message.content;
        console.log(`"${text}" => "${translatedText}"`);

        return translatedText;
    } catch (error) {
        console.error(`Error translating "${text}":`, error);
        throw error;
    }
}

module.exports = translate;
