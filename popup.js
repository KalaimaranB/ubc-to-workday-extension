let isSyncing = false;
let quoteInterval;

document.getElementById('syncButton').addEventListener('click', async () => {
    if (isSyncing) return;

    isSyncing = true;
    document.getElementById('status').innerText = 'Syncing...';

    const fileInput = document.getElementById('fileInput');

    if (fileInput.files.length === 0) {
        document.getElementById('status').innerText = 'Please select an Excel file.';
        isSyncing = false;
        return;
    }

    const quotes = await fetchQuotes();
    startQuoteDisplay(quotes);

    const file = fileInput.files[0];
    const courses = await parseExcel(file);

    chrome.runtime.sendMessage({ action: 'createCalendarAndAddCourses', courses: courses }, (response) => {
        if (response.error) {
            console.error('Error:', response.error);
            document.getElementById('status').innerText = 'Error syncing courses. Please try again.';
        } else {
            console.log('Courses added successfully');
            document.getElementById('status').innerText = `Sync complete!`;
        }
        isSyncing = false;
        stopQuoteDisplay();
    });
});

async function fetchQuotes() {
    const response = await fetch(chrome.runtime.getURL('quotes.txt'));
    const text = await response.text();
    return text.split('\n').filter(line => line.trim() !== '');
}

function startQuoteDisplay(quotes) {
    const quoteElement = document.getElementById('quote');
    const forehandText = "While you wait, here are some Star Wars Clone Wars quotes to enjoy! \n";

    if (quotes.length > 0) {
        let index = 0;

        quoteInterval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * quotes.length);
            quoteElement.innerText = `${forehandText}\n${quotes[randomIndex]}`;
        }, 5000);
    }
}

function stopQuoteDisplay() {
    clearInterval(quoteInterval);
    const quoteElement = document.getElementById('quote');
    quoteElement.innerText = ''; // Clear the quote text
}


async function parseExcel(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

  const headers = rows[2].map(header => header.trim());
  const courses = [];

  rows.slice(3).forEach(row => {
    const course = headers.reduce((acc, header, index) => {
      acc[header] = row[index];
      return acc;
    }, {});

    if (course['Registration Status'] === 'Registered' && course['Meeting Patterns']) {
      const meetingPatterns = course['Meeting Patterns'].split('\n');
      meetingPatterns.forEach(pattern => {
        const courseInfos = parseMeetingPattern(pattern, course['Section']);
        if (courseInfos) {
          courses.push(...courseInfos);
        }
      });
    }
  });

  return courses;
}


function parseMeetingPattern(meetingPattern, section) {
  try {
    const parts = meetingPattern.split(' | ').filter(part => part.trim() !== '');

    if (parts.length < 3) {
      console.log(`Skipping invalid meeting pattern: ${meetingPattern}`);
      return [];
    }

    const [dateRangePart, days, timeRange] = parts;
    let location = '';

    if (parts.length > 3) {
      location = parts.slice(3).join(' | ').trim();
    }

    let [startTime, endTime] = timeRange.split(' - ').map(t => sanitizeTime(t.trim()));

    if (!startTime || !endTime) {
      console.error(`Invalid time range: ${timeRange}`);
      return [];
    }

    const daysMap = {
      'Mon': 'MO',
      'Tue': 'TU',
      'Wed': 'WE',
      'Thu': 'TH',
      'Fri': 'FR',
      'Sat': 'SA',
      'Sun': 'SU'
    };

    const parsedDays = days.split(' ').map(day => daysMap[day]).filter(day => day);

    if (parsedDays.length === 0) {
      console.error(`Invalid days format: ${days}`);
      return [];
    }

    const [startDate, endDate] = dateRangePart.split(' - ').map(d => d.trim());

    if (!startDate || !endDate) {
      console.error(`Invalid date range: ${dateRangePart}`);
      return [];
    }

    const alternateWeeks = days.includes("(Alternate weeks)");

    return [{
      section,
      start_date: startDate,
      end_date: endDate,
      days: parsedDays,
      alternate_weeks: alternateWeeks,
      start_time: convertTo24Hour(startTime, section),
      end_time: convertTo24Hour(endTime, section),
      location
    }];
  } catch (error) {
    console.error(`Error parsing meeting pattern '${meetingPattern}':`, error);
    return [];
  }
}

function sanitizeTime(time) {
  return time.replace(/[^\d:APMampm\s]/g, '').trim();
}


function convertTo24Hour(timeStr, sender = "") {
  if (!timeStr) {
    console.error(`Invalid time string: ${timeStr}`);
    return '00:00'; // Default to midnight if invalid
  }

  const periodMatch = timeStr.match(/(A\.?M\.?|P\.?M\.?)/i);
  if (!periodMatch) {
    console.error(`Invalid period in time string: ${timeStr}`);
    return '00:00'; // Default to midnight if invalid
  }

  const period = periodMatch[0].toUpperCase();
  const time = timeStr.replace(periodMatch[0], '').trim();

  let [hours, minutes] = time.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    console.error(`Invalid time values: ${timeStr}`);
    return '00:00'; // Default to midnight if invalid
  }

  if (period.includes('P') && hours < 12) {
    hours += 12;
  } else if (period.includes('A') && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
