'use strinct'

const {
    STRAPI3_COLLECTIONS_PATH,
    STRAPI3_COMPONENTS_PATH,

    STRAPI4_API_PATH,
    STRAPI4_COMPONENT_PATH,

    STRAPI3_DATAMODEL_PATH
} = require('./paths.js')

const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')

// perform data migration according to the data model


const STRAPI_3_URL = 'https://admin.poff.ee'
const S_3_IDENTIFIER = process.env.StrapiUserName
const S_3_PASSWORD = process.env.StrapiPassword

const STRAPI_4_URL = 'http://127.0.0.1:1337'
const STRAPI_4_TOKEN = 'eb13ccacc7247e31abdb4cccf48067c06c404b7c9cee13c501d86557806f2af67dccd08ba85d3904ffee594a4641ec1410bbdf710a18fe7b07419f5f9fb0cb8916d31662e63e7015b5e239359b236e2b98e0b2e1bc8faa1765296ad35e352275f7293eda0a1f124058f7478b1b20753ee5667f36b7a8b6933b4aef68949fe867'

const s3datamodel = yaml.load(fs.readFileSync(STRAPI3_DATAMODEL_PATH, 'utf8'))
// find first 5 collections with _path property
const S_3_PATHS = Object.keys(s3datamodel)
    .filter((collection) => s3datamodel[collection]._path)
    .slice(0, 17)
    .map((collection) => s3datamodel[collection]._path)

console.log(S_3_PATHS)


const axios = require('axios')
const qs = require('qs')

const importCollection = async (s3collection, strapi3token) => {
    const s3collectionUrl = `${STRAPI_3_URL}${s3collection}`
    const s3data = await axios.get(s3collectionUrl, {
        headers: { Authorization: `Bearer ${strapi3token}` }
    }).then((response) => response.data
    ).then((s3collectionData) => {
        console.log(`Fetched ${s3collectionData.length} entities from ${s3collectionUrl}`)
        return s3collectionData
    }).catch((error) => {
        console.log(error)
    })

    if (!s3data || !s3data.length || s3data.length === 0) {
        console.log(`No data in ${s3collectionUrl}`)
        return 0
    }
    // return { s3collection, s3collectionData }
    // upload to strapi4
    const s4collectionUrl = `${STRAPI_4_URL}/api${s3collection}`
    // console.log(`Upload ${s3data.length} entities to ${s4collectionUrl}`)
    // upload data to strapi4 from s3collectionData array
    // for every item in s3collectionData array
    // make a post request to s4collectionUrl and pass the item as data

    const s4collectionData = []
    for (const item of s3data) {
        const itemData = await axios.post(s4collectionUrl, { data: item }, {
            headers: { Authorization: `Bearer ${STRAPI_4_TOKEN}` }
        }).then((response) => response.data
        ).catch((error) => {
            if (error.response.status === 500) { return }
            console.log(`Error uploading ${JSON.stringify(item, 0, 2)} to ${s4collectionUrl}. status: ${error.response.status}`)
        })
        if (!itemData) {
            continue
        }
        console.log(`Uploaded ${itemData.data.id} to ${s4collectionUrl}`)
        s4collectionData.push(itemData)
    }
    return s4collectionData.length
}

async function main() {
    const authUrl = `${STRAPI_3_URL}/auth/local   `
    const strapi3token = await axios.post(authUrl, qs.stringify({
        identifier: S_3_IDENTIFIER,
        password: S_3_PASSWORD
    }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).then((response) => response.data.jwt
    ).catch((error) => {
        console.log(error)
    })
    // console.log(strapi3token)

    // Query the strapi database for first 5 collections with _path property
    for (const s3collection of S_3_PATHS) {
        if (s3collection !== '/tag-categories') { continue }
        console.log(`== Importing from ${s3collection}`)
        const numOfObjects = await importCollection(s3collection, strapi3token)
        console.log(`== Imported ${numOfObjects} objects from ${s3collection}`)
    }

    console.log('TOO EARLY TO RETURN strapi4collections')
}

main()
// postTestData()

async function postTestData() {
    const testObject = {
        "id": 1,
        "title_en": "Best Project",
        "description": [],
        "created_at": "2021-10-04T19:50:12.846Z",
        "updated_at": "2021-10-04T19:50:12.860Z",
        "title_et": null,
        "title_ru": null,
        "slug_et": null,
        "slug_en": "best-project",
        "slug_ru": null,
        "awardings": []
    }
    const testUrl = `${STRAPI_4_URL}/api/industry-awards`
    const testObjectData = await axios.post(testUrl, { data: testObject }, {
        headers: { Authorization: `Bearer ${STRAPI_4_TOKEN}` }
    }).then((response) => response.data
    ).catch((error) => {
        console.log(error.response.data)
    })
    console.log({ response: testObjectData })
}
