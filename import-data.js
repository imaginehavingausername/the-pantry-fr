import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import Papa from 'papaparse'

const prisma = new PrismaClient()

async function importFoodCsv() {
  try {
    // Read the CSV file
    const csvFile = fs.readFileSync('food.csv', 'utf8')
    
    // Parse CSV with robust settings
    const results = Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep as strings to handle better
      transformHeader: (header) => header.trim() // Remove whitespace from headers
    })

    console.log('Parsed', results.data.length, 'rows')
    
    let successCount = 0
    let errorCount = 0

    for (const [index, row] of results.data.entries()) {
      try {
        // Skip rows where name is empty or just whitespace
        if (!row.name || row.name.trim() === '') {
          console.log(`Skipping row ${index + 1}: Empty name`)
          continue
        }

        // Parse expiration date
        let expirationDate = null
        if (row.expirationDate && row.expirationDate.trim() !== '') {
          // Handle different date formats in your CSV
          const dateStr = row.expirationDate.trim()
          
          // Try parsing MM/DD/YY format first
          if (dateStr.includes('/')) {
            const [month, day, year] = dateStr.split('/')
            let fullYear = year
            
            // Convert 2-digit year to 4-digit (assuming 20xx for years < 50, 19xx for >= 50)
            if (year.length === 2) {
              fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`
            }
            
            expirationDate = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
          } else {
            // Try direct parsing
            expirationDate = new Date(dateStr)
          }
          
          // Check if date is valid
          if (isNaN(expirationDate.getTime())) {
            console.log(`Warning: Invalid date "${row.expirationDate}" for ${row.name}, setting to null`)
            expirationDate = null
          }
        }

        // Parse quantity - default to 1 if empty or invalid
        let quantity = 1
        if (row.quantity && row.quantity.trim() !== '') {
          const quantityStr = row.quantity.trim()
          const parsedQuantity = parseFloat(quantityStr)
          if (!isNaN(parsedQuantity) && parsedQuantity >= 0) {
            quantity = Math.floor(parsedQuantity) // Round down to integer
          }
        }

        // Parse keywords - split by comma and clean up
        let keywords = []
        if (row.keywords && row.keywords.trim() !== '') {
          keywords = row.keywords
            .split(',')
            .map(keyword => keyword.trim())
            .filter(keyword => keyword.length > 0)
        }

        // Clean up placement
        let placement = row.placement && row.placement.trim() !== '' ? row.placement.trim() : 'Unknown'
        
        // Handle placement with quotes
        placement = placement.replace(/^"|"$/g, '') // Remove leading/trailing quotes
        
        // Parse hidden field
        let hidden = false
        if (row.hidden && row.hidden.trim() !== '') {
          const hiddenStr = row.hidden.trim().toUpperCase()
          hidden = hiddenStr === 'TRUE' || hiddenStr === '1'
        }

        // Create the food item
        const foodItem = await prisma.foodItem.create({
          data: {
            name: row.name.trim(),
            expirationDate: expirationDate,
            quantity: quantity,
            imageUrl: null, // No image URLs in your CSV
            keywords: keywords,
            placement: placement,
            hidden: hidden
          }
        })

        console.log(`✓ Created: ${foodItem.name} (ID: ${foodItem.id})`)
        successCount++

      } catch (error) {
        console.error(`Error processing row ${index + 1} (${row.name}):`, error.message)
        errorCount++
      }
    }

    console.log('\n=== Import Summary ===')
    console.log(`Successfully imported: ${successCount} items`)
    console.log(`Errors: ${errorCount} items`)
    console.log('Import completed!')

  } catch (error) {
    console.error('Fatal error during import:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the import
importFoodCsv()
  .catch(console.error)