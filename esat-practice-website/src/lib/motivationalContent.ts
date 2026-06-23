export const MOTIVATIONAL_QUOTES = [
  "Success is the sum of small efforts, repeated day in and day out.",
  "The expert in anything was once a beginner.",
  "It always seems impossible until it's done.",
  "Education is not the filling of a pail, but the lighting of a fire.",
  "The roots of education are bitter, but the fruit is sweet.",
  "Success is stumbling from failure to failure with no loss of enthusiasm.",
  "Hard work beats talent when talent doesn't work hard.",
  "You cannot change your future, but you can change your habits, and surely your habits will change your future.",
  "The beautiful thing about learning is that nobody can take it away from you.",
  "If you are willing to learn, no one can stop you.",
  "The mind is not a vessel to be filled but a fire to be kindled.",
  "Live as if you were to die tomorrow. Learn as if you were to live forever.",
  "Today a reader, tomorrow a leader.",
  "The more that you read, the more things you will know. The more that you learn, the more places you'll go.",
  "The best investment you can make is in yourself.",
  "In the middle of difficulty lies opportunity.",
  "Mistakes are the portals of discovery.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "Success is no accident. It is hard work, perseverance, learning, studying, sacrifice and most of all, love of what you are doing.",
  "Start where you are. Use what you have. Do what you can.",
  "What you learn from a life in science is the vastness of our ignorance.",
  "Risk comes from not knowing what you're doing.",
  "Everything is theoretically impossible until it is done.",
  "I have not failed. I've just found 10,000 ways that won't work.",
  "The important thing is not to stop questioning.",
  "Engineering is the closest thing to magic that exists in the world.",
  "The best way to predict the future is to create it.",
  "Knowledge is of no value unless you put it into practice.",
  "The first principle is that you must not fool yourself and you are the easiest person to fool.",
  "I learned very early the difference between knowing the name of something and knowing something.",
  "Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.",
  "Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less.",
  "We must believe that we are gifted for something, and that this thing, at whatever cost, must be attained.",
  "One never notices what has been done; one can only see what remains to be done.",
  "A scientist studies what is, whereas an engineer creates what never was.",
  "One accurate measurement is worth a thousand expert opinions.",
  "Once you get your courage up and believe that you can do important problems, then you can.",
  "If others would think as hard as I did, then they would get similar results.",
  "Chance favors the prepared mind.",
  "Mathematics is not a spectator sport.",
  "If you can't solve a problem, then there is an easier problem you can solve: find it.",
  "It is better to solve one problem five different ways than to solve five problems one way.",
  "Solving problems is a practical art, like swimming, or skiing, or playing the piano: you can learn it only by imitation and practice.",
  "Nearly everything is really interesting if you go into it deeply enough.",
  "A mathematician, like a painter or a poet, is a maker of patterns.",
  "Beauty is the first test: there is no permanent place in the world for ugly mathematics.",
  "Young man, in mathematics you don't understand things. You just get used to them.",
  "I just wondered how things were put together.",
  "Sir, an equation has no meaning for me unless it expresses a thought of God.",
  "I am more interested in the elegance of a problem. Is it a good problem, an interesting problem?",
  "When something is important enough, you do it even if the odds are not in your favor.",
  "Persistence is very important. You should not give up unless you are forced to give up.",
  "Failure is an option here. If things are not failing, you are not innovating enough.",
  "I think it is possible for ordinary people to choose to be extraordinary.",
  "Science is discovering the essential truths about what exists in the universe. Engineering is about creating things that have never existed before.",

  "Everything should be made as simple as possible, but not simpler.",
  "The greatest obstacle to discovery is not ignorance—it is the illusion of knowledge.",
  "An investment in knowledge pays the best interest.",
  "The harder I work, the luckier I get.",
  "It is not that I'm so smart. But I stay with the questions much longer.",
  "Anyone who has never made a mistake has never tried anything new.",
  "Learn from yesterday, live for today, hope for tomorrow. The important thing is not to stop questioning.",
  "If people do not believe that mathematics is simple, it is only because they do not realise how complicated life is.",
  "The difference between ordinary and extraordinary is that little extra.",
  "Great works are performed not by strength but by perseverance.",
  "Do not wait; the time will never be 'just right.'",
  "The best way out is always through.",
  "The reward of a thing well done is having done it.",
  "Fall seven times, stand up eight.",
  "The man who moves a mountain begins by carrying away small stones.",
  "The journey of a thousand miles begins with a single step.",
  "Without deviation from the norm, progress is not possible.",
  "The reasonable man adapts himself to the world; the unreasonable one persists in trying to adapt the world to himself. Therefore all progress depends on the unreasonable man.",
  "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.",
];

export const GREETINGS_BY_TIME = {
  earlyMorning: [
    "Rise and grind",
    "Fresh start incoming",
    "New day, new gains (for the brain)",
    "Let's make today count",
    "Before the world wakes up",
    "Quiet hours, loud progress",
    "First rep of the day",
    "Early bird gets the mark scheme",
  ],
  morning: [
    "Good Morning",
    "Coffee and questions?",
    "Ready to learn something new?",
    "Brain's warmed up, let's use it",
    "Clean slate, sharp mind",
    "What's first on the list?",
  ],
  midday: [
    "Keep the momentum going",
    "Lunch break study session?",
    "Afternoon push!",
    "Halfway there, let's go!",
    "Don't let the day coast",
    "Second wind o'clock",
    "Mid-day check-in",
  ],
  afternoon: [
    "Good Afternoon",
    "Afternoon grind session?",
    "Push through the afternoon slump",
    "Past the halfway mark",
    "Keep the streak alive",
    "Steady as she goes",
  ],
  lateAfternoon: [
    "Final stretch of the day",
    "Almost there, keep going",
    "Sunset sessions hit different",
    "Evening energy unlocked",
    "Golden hour, grind hour",
    "One more push before dinner",
    "Closing out strong",
  ],
  evening: [
    "Good Evening",
    "Night owl studying?",
    "Calm focus mode activated",
    "Reflective study time",
    "Prime time for deep focus",
    "Quiet house, loud thoughts",
    "Evening shift starts now",
  ],
  night: [
    "Late night sessions",
    "Burning the midnight oil?",
    "3AM motivation?",
    "Night grind never stops",
    "Most people clocked out. You didn't.",
    "Lights low, focus high",
    "Productive hours, unsociable hours",
  ],
  lateNight: [
    "Still going?",
    "The night is young",
    "Insomnia investor",
    "Sleep is for after exam season, apparently",
    "3AM motivation?",
    "Tomorrow-you says thanks",
    "Send it",
    "The exam doesn't care what time it is",
  ],
};

export function getRandomQuote(): string {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

export function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  let timeCategory: keyof typeof GREETINGS_BY_TIME;

  if (hour < 5) {
    timeCategory = "lateNight";
  } else if (hour < 7) {
    timeCategory = "earlyMorning";
  } else if (hour < 12) {
    timeCategory = "morning";
  } else if (hour < 13) {
    timeCategory = "midday";
  } else if (hour < 17) {
    timeCategory = "afternoon";
  } else if (hour < 19) {
    timeCategory = "lateAfternoon";
  } else if (hour < 21) {
    timeCategory = "evening";
  } else {
    timeCategory = "night";
  }

  const greetings = GREETINGS_BY_TIME[timeCategory];
  return greetings[Math.floor(Math.random() * greetings.length)];
}
