'use strict'

// Translate 'V3V4map - export.csv' to 'V3V4map.yaml' and 'V3V4map.json'

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const csv = require('csv-parser')

// Read the CSV file
const mappingSource = path.join(__dirname, 'V3V4map - export.csv')
const mapping = []


const parseCsv = (mappingSource) => {
    return new Promise((resolve, reject) => {
        fs.createReadStream(mappingSource)
            .pipe(csv())
            .on('data', (row) => {
                mapping.push(row)
            })
            .on('end', () => {
                resolve(mapping)
            })
            .on('error', (error) => {
                reject(error)
            })
    })
}

console.log(`Reading ${mappingSource}`)
parseCsv(mappingSource)
    .then((mapping) => {
        console.log(mapping)

        // Transform collection types to Strapi 4 format
        // - Add v3 and v4 api paths to the collection type
        const relevantCollectionTypes = []
        mapping.forEach(item => {

            // Skip empty rows
            if (!item.datamodelKey) {
                return
            }

            // Transfer to transformers
            // transformer.relevantCollectionType = item
            // item.s3ApiPath = `/${pluralize(item.folderName)}`
            relevantCollectionTypes.push({
                datamodelKey: item.datamodelKey,
                kind: item.kind,
                s3: {
                    folderName: item['s3.folderName'],
                    apiPath: item['s3.apiPath'],
                    collectionName: item['s3.collectionName'],
                    info: {
                        singularName: item['s3.info.singularName'],
                        pluralName: item['s3.info.pluralName'],
                        displayName: item['s3.info.displayName']
                    }
                },
                s4: {
                    apiPath: item['s4.apiPath'],
                    collectionName: item['s4.collectionName'],
                    info: {
                        singularName: item['s4.info.singularName'],
                        pluralName: item['s4.info.pluralName'],
                        displayName: item['s4.info.displayName']
                    }
                }
            })
        }

        )
        // console.log(relevantCollectionTypes)
        // Save to ./RelevantCollectionTypes.json for sanity check
        const relevantCollectionTypesJson = JSON.stringify(relevantCollectionTypes, null, 2)
        const relevantCollectionTypesJsonPath = path.join(__dirname, 'RelevantCollectionTypes.json')
        fs.writeFileSync(relevantCollectionTypesJsonPath, relevantCollectionTypesJson)
        console.log(`Wrote ${relevantCollectionTypesJsonPath}`)
        // Save to ./RelevantCollectionTypes.yaml for sanity check
        const relevantCollectionTypesYaml = yaml.dump(relevantCollectionTypes)

        const relevantCollectionTypesYamlPath = path.join(__dirname, 'RelevantCollectionTypes.yaml')
        fs.writeFileSync(relevantCollectionTypesYamlPath, relevantCollectionTypesYaml)
        console.log(`Wrote ${relevantCollectionTypesYamlPath}`)
    })
    .catch((error) => {
        console.error(error)
    })
