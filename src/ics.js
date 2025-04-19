/**
 * Parses an ICS file string and converts it to a structured format readable by LLMs
 * @param {string} icsString - The raw ICS file content as a string
 * @return {string} - Formatted, human-readable text of calendar events
 */
export default function parseICSForLLM(icsString) {
    // Remove carriage returns and split by line feeds
    const lines = icsString.replace(/\r/g, '').split('\n');
    const events = [];
    let currentEvent = null;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Handle line folding (lines that start with a space or tab are continuation of previous line)
      if (line.startsWith(' ') || line.startsWith('\t')) {
        if (i > 0) {
          lines[i-1] += line.substring(1);
          continue;
        }
      }
      
      // Begin a new event
      if (line === 'BEGIN:VEVENT') {
        currentEvent = {};
        continue;
      }
      
      // End an event and add it to our collection
      if (line === 'END:VEVENT') {
        if (currentEvent) {
          events.push(currentEvent);
          currentEvent = null;
        }
        continue;
      }
      
      // Skip if we're not in an event
      if (!currentEvent) continue;
      
      // Parse property lines (format is typically PROPERTY:VALUE or PROPERTY;PARAM=VALUE:VALUE)
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        let [property, value] = [line.substring(0, colonIndex), line.substring(colonIndex + 1)];
        
        // Handle properties with parameters
        const semiIndex = property.indexOf(';');
        if (semiIndex > 0) {
          property = property.substring(0, semiIndex);
        }
        
        // Process specific properties
        switch (property) {
          case 'SUMMARY':
            currentEvent.title = value;
            break;
          case 'DESCRIPTION':
            currentEvent.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\');
            break;
          case 'LOCATION':
            currentEvent.location = value;
            break;
          case 'DTSTART':
            currentEvent.startDate = formatICSDate(value);
            break;
          case 'DTEND':
            currentEvent.endDate = formatICSDate(value);
            break;
          case 'CREATED':
            currentEvent.created = formatICSDate(value);
            break;
          case 'LAST-MODIFIED':
            currentEvent.lastModified = formatICSDate(value);
            break;
          case 'RRULE':
            currentEvent.recurrence = parseRecurrenceRule(value);
            break;
          case 'ATTENDEE':
            if (!currentEvent.attendees) currentEvent.attendees = [];
            currentEvent.attendees.push(parseAttendee(value));
            break;
          case 'ORGANIZER':
            currentEvent.organizer = parseOrganizer(value);
            break;
          case 'UID':
            currentEvent.uid = value;
            break;
          case 'STATUS':
            currentEvent.status = value;
            break;
          default:
            // Store any other properties
            if (!currentEvent.otherProperties) currentEvent.otherProperties = {};
            currentEvent.otherProperties[property] = value;
        }
      }
    }
    
    // Format events into human-readable text
    return formatEventsForLLM(events);
  }
  
  /**
   * Formats an ICS date string into a more readable format
   * @param {string} icsDate - ICS format date
   * @return {string} - Formatted date string
   */
  function formatICSDate(icsDate) {
    // Check for UTC suffix
    const isUTC = icsDate.endsWith('Z');
    
    // Handle date-time format (basic or extended)
    if (icsDate.includes('T')) {
      let year, month, day, hour, minute, second;
      
      if (icsDate.length >= 15) { // With seconds
        year = icsDate.substring(0, 4);
        month = icsDate.substring(4, 6);
        day = icsDate.substring(6, 8);
        hour = icsDate.substring(9, 11);
        minute = icsDate.substring(11, 13);
        second = icsDate.substring(13, 15);
      } else { // Without seconds
        year = icsDate.substring(0, 4);
        month = icsDate.substring(4, 6);
        day = icsDate.substring(6, 8);
        hour = icsDate.substring(9, 11);
        minute = icsDate.substring(11, 13);
        second = '00';
      }
      
      const dateObj = new Date(
        Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 
                 parseInt(hour), parseInt(minute), parseInt(second))
      );
      
      // Format options
      const options = { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: isUTC ? 'UTC' : 'short'
      };
      
      return dateObj.toLocaleString('en-US', options);
    } 
    // Handle date-only format
    else {
      const year = icsDate.substring(0, 4);
      const month = icsDate.substring(4, 6);
      const day = icsDate.substring(6, 8);
      
      const dateObj = new Date(
        Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day))
      );
      
      const options = { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
      };
      
      return dateObj.toLocaleString('en-US', options);
    }
  }
  
  /**
   * Parse recurrence rule into readable format
   * @param {string} rruleStr - ICS RRULE value
   * @return {string} - Human-readable recurrence description
   */
  function parseRecurrenceRule(rruleStr) {
    const parts = rruleStr.split(';');
    let result = [];
    
    parts.forEach(part => {
      const [key, value] = part.split('=');
      
      switch(key) {
        case 'FREQ':
          result.push(`Repeats ${value.toLowerCase()}`);
          break;
        case 'INTERVAL':
          if (value !== '1') {
            result.push(`every ${value}`);
          }
          break;
        case 'COUNT':
          result.push(`for ${value} occurrences`);
          break;
        case 'UNTIL':
          result.push(`until ${formatICSDate(value)}`);
          break;
        case 'BYDAY':
          const days = value.split(',');
          const dayNames = {
            MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', 
            TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday'
          };
          const dayList = days.map(d => {
            const num = d.match(/^(-?\d+)/);
            const day = d.match(/([A-Z]{2})$/)[1];
            if (num) {
              const n = parseInt(num[1]);
              return `the ${getOrdinal(n)} ${dayNames[day]}`;
            }
            return dayNames[day];
          });
          result.push(`on ${formatList(dayList)}`);
          break;
        case 'BYMONTHDAY':
          const days2 = value.split(',');
          const dayList2 = days2.map(d => getOrdinal(parseInt(d)));
          result.push(`on the ${formatList(dayList2)} of the month`);
          break;
        case 'BYMONTH':
          const months = value.split(',');
          const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];
          const monthList = months.map(m => monthNames[parseInt(m) - 1]);
          result.push(`in ${formatList(monthList)}`);
          break;
      }
    });
    
    return result.join(' ');
  }
  
  /**
   * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
   */
  function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  
  /**
   * Format a list of items with commas and "and"
   */
  function formatList(items) {
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
  }
  
  /**
   * Parse attendee information
   */
  function parseAttendee(value) {
    // Default attendee object
    let attendee = { email: '' };
    
    // Extract common name if present
    const cnMatch = value.match(/CN=([^;:]+)/i);
    if (cnMatch) {
      attendee.name = cnMatch[1];
    }
    
    // Extract email from mailto:
    const mailtoMatch = value.match(/mailto:([^;:]+)/i);
    if (mailtoMatch) {
      attendee.email = mailtoMatch[1];
    } else {
      // If no mailto, use the value after the last colon
      attendee.email = value.substring(value.lastIndexOf(':') + 1);
    }
    
    // Extract participation status
    const partstatMatch = value.match(/PARTSTAT=([^;:]+)/i);
    if (partstatMatch) {
      const statusMap = {
        'ACCEPTED': 'Accepted',
        'DECLINED': 'Declined',
        'TENTATIVE': 'Tentative',
        'NEEDS-ACTION': 'Needs Action',
        'DELEGATED': 'Delegated'
      };
      attendee.status = statusMap[partstatMatch[1]] || partstatMatch[1];
    }
    
    // Extract role
    const roleMatch = value.match(/ROLE=([^;:]+)/i);
    if (roleMatch) {
      const roleMap = {
        'REQ-PARTICIPANT': 'Required',
        'OPT-PARTICIPANT': 'Optional',
        'NON-PARTICIPANT': 'Non-Participant',
        'CHAIR': 'Chair'
      };
      attendee.role = roleMap[roleMatch[1]] || roleMatch[1];
    }
    
    return attendee;
  }
  
  /**
   * Parse organizer information
   */
  function parseOrganizer(value) {
    let organizer = { email: '' };
    
    // Extract common name if present
    const cnMatch = value.match(/CN=([^;:]+)/i);
    if (cnMatch) {
      organizer.name = cnMatch[1];
    }
    
    // Extract email from mailto:
    const mailtoMatch = value.match(/mailto:([^;:]+)/i);
    if (mailtoMatch) {
      organizer.email = mailtoMatch[1];
    } else {
      // If no mailto, use the value after the last colon
      organizer.email = value.substring(value.lastIndexOf(':') + 1);
    }
    
    return organizer;
  }
  
  /**
   * Format event objects into human-readable text suitable for LLMs
   */
  function formatEventsForLLM(events) {
    if (events.length === 0) {
      return "No calendar events found in this ICS file.";
    }
    
    let output = `# Calendar Events\n\n`;
    output += `Found ${events.length} event${events.length > 1 ? 's' : ''} in the calendar file.\n\n`;
    
    events.forEach((event, index) => {
      output += `## Event ${index + 1}: ${event.title || 'Untitled Event'}\n\n`;
      
      if (event.startDate) {
        if (event.endDate) {
          output += `**When**: ${event.startDate} to ${event.endDate}\n\n`;
        } else {
          output += `**When**: ${event.startDate}\n\n`;
        }
      }
      
      if (event.location) {
        output += `**Where**: ${event.location}\n\n`;
      }
      
      if (event.description) {
        output += `**Description**:\n${event.description}\n\n`;
      }
      
      if (event.recurrence) {
        output += `**Recurrence**: ${event.recurrence}\n\n`;
      }
      
      if (event.status) {
        const statusMap = {
          'CONFIRMED': 'Confirmed',
          'TENTATIVE': 'Tentative',
          'CANCELLED': 'Cancelled'
        };
        output += `**Status**: ${statusMap[event.status] || event.status}\n\n`;
      }
      
      if (event.organizer) {
        output += `**Organizer**: ${event.organizer.name || ''} <${event.organizer.email}>\n\n`;
      }
      
      if (event.attendees && event.attendees.length > 0) {
        output += `**Attendees**:\n`;
        event.attendees.forEach(attendee => {
          let attendeeInfo = '';
          if (attendee.name) {
            attendeeInfo += attendee.name;
          }
          if (attendee.email) {
            attendeeInfo += attendeeInfo ? ` <${attendee.email}>` : attendee.email;
          }
          if (attendee.role) {
            attendeeInfo += ` (${attendee.role})`;
          }
          if (attendee.status) {
            attendeeInfo += ` - ${attendee.status}`;
          }
          output += `- ${attendeeInfo}\n`;
        });
        output += '\n';
      }
      
      if (event.uid) {
        output += `**UID**: ${event.uid}\n\n`;
      }
      
      // Add a separator between events
      if (index < events.length - 1) {
        output += `---\n\n`;
      }
    });
    
    return output;
  }
  
  /**
   * Main function to process an ICS file and convert it to LLM-friendly text
   */
  function convertICSToReadableText(icsContent) {
    try {
      return parseICSForLLM(icsContent);
    } catch (error) {
      return `Error parsing ICS file: ${error.message}\n\nPlease check that the ICS file is valid.`;
    }
  }
  
  // Example usage:
  // const fs = require('fs');
  // const icsContent = fs.readFileSync('calendar.ics', 'utf-8');
  // const readableText = convertICSToReadableText(icsContent);
  // console.log(readableText);