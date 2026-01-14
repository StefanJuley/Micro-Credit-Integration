const fs = require('fs');
const path = require('path');

// Пример использования: node decode-pdf.js <base64_string> [output_filename]
// Или: вставь base64 данные в переменную base64Data ниже

const base64Data = process.argv[2] || '';
const outputFileName = process.argv[3] || 'contract.pdf';

if (!base64Data) {
    console.log('Использование: node decode-pdf.js <base64_string> [output_filename]');
    console.log('Или вставь base64 данные в файл и запусти: node decode-pdf.js "$(cat data.txt)"');
    process.exit(1);
}

try {
    const buffer = Buffer.from(base64Data, 'base64');
    const outputPath = path.join(__dirname, '..', outputFileName);

    fs.writeFileSync(outputPath, buffer);
    console.log(`PDF сохранен: ${outputPath}`);
    console.log(`Размер: ${(buffer.length / 1024).toFixed(2)} KB`);
} catch (error) {
    console.error('Ошибка декодирования:', error.message);
    process.exit(1);
}
