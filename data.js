// 하루 5문장 · [한국어, English, 핵심 표현, 표현 뜻]
const DAYS = [
  [
    ['회의가 오후 3시로 옮겨졌어요.', 'The meeting was moved to 3 p.m.', 'be moved to', '~로 옮겨지다'],
    ['이 커피 조금만 덜 달게 해 주실래요?', 'Could you make this coffee a little less sweet?', 'a little less', '조금 덜'],
    ['저는 아직 그 소식을 못 들었어요.', "I haven't heard the news yet.", "haven't ~ yet", '아직 ~ 못 했다'],
    ['주말에 뭐 할 계획이에요?', 'What are you planning to do this weekend?', 'be planning to', '~할 계획이다'],
    ['늦어서 죄송해요, 길이 많이 막혔어요.', "Sorry I'm late, I got stuck in traffic.", 'get stuck in traffic', '차가 막혀 꼼짝 못 하다'],
  ],
  [
    ['창가 자리에 앉아도 될까요?', 'Can I sit by the window?', 'by the window', '창가에'],
    ['오늘 정말 피곤해 보이네요.', 'You look really tired today.', 'look tired', '피곤해 보이다'],
    ['이거 다른 색도 있나요?', 'Do you have this in another color?', 'in another color', '다른 색으로'],
    ['잠깐만 기다려 주시겠어요?', 'Could you wait a moment?', 'wait a moment', '잠깐 기다리다'],
    ['생각보다 훨씬 쉬웠어요.', 'It was much easier than I thought.', 'easier than I thought', '생각보다 쉬운'],
  ],
  [
    ['이 메일 좀 확인해 주실 수 있나요?', 'Could you check this email for me?', 'check ~ for me', '대신 확인해 주다'],
    ['내일까지 끝낼 수 있을 것 같아요.', 'I think I can finish it by tomorrow.', 'by tomorrow', '내일까지'],
    ['제가 다시 연락드릴게요.', "I'll get back to you.", 'get back to', '다시 연락하다'],
    ['그 부분은 제가 맡을게요.', "I'll take care of that part.", 'take care of', '맡아서 처리하다'],
    ['오늘은 일찍 퇴근할게요.', "I'm leaving work early today.", 'leave work', '퇴근하다'],
  ],
  [
    ['여기서 역까지 얼마나 걸려요?', 'How long does it take to get to the station?', 'how long does it take', '얼마나 걸려요'],
    ['체크인은 몇 시부터예요?', 'What time does check-in start?', 'what time', '몇 시에'],
    ['사진 한 장 찍어 주시겠어요?', 'Could you take a picture of us?', 'take a picture', '사진을 찍다'],
    ['이 근처에 맛집 있어요?', 'Is there a good restaurant around here?', 'around here', '이 근처에'],
    ['길을 잃은 것 같아요.', "I think I'm lost.", 'be lost', '길을 잃다'],
  ],
  [
    ['그 말을 들으니 정말 다행이에요.', "I'm so relieved to hear that.", 'be relieved', '안심하다'],
    ['너무 긴장해서 잠을 못 잤어요.', "I was so nervous that I couldn't sleep.", 'so ~ that', '너무 ~해서'],
    ['신경 쓰지 마세요.', "Don't worry about it.", 'worry about', '걱정하다'],
    ['정말 기대돼요!', "I'm really looking forward to it!", 'look forward to', '기대하다'],
    ['그럴 줄 알았어요.', 'I saw that coming.', 'see ~ coming', '예상하다'],
  ],
  [
    ['요즘 운동을 시작했어요.', 'I started working out recently.', 'work out', '운동하다'],
    ['어젯밤에 잠을 설쳤어요.', "I didn't sleep well last night.", 'sleep well', '잘 자다'],
    ['물을 좀 더 마셔야겠어요.', 'I should drink more water.', 'I should', '~해야겠다'],
    ['머리가 좀 아파요.', 'I have a slight headache.', 'have a headache', '머리가 아프다'],
    ['오늘은 푹 쉬세요.', 'Get some rest today.', 'get some rest', '좀 쉬다'],
  ],
  [
    ['몇 시에 만날까요?', 'What time should we meet?', 'should we', '우리 ~할까요'],
    ['조금 늦을 것 같아요.', "I think I'll be a little late.", 'be a little late', '조금 늦다'],
    ['다음에 같이 밥 먹어요.', "Let's grab a meal sometime.", 'grab a meal', '밥 먹다'],
    ['거기서 기다리고 있을게요.', "I'll be waiting there.", 'be waiting', '기다리고 있다'],
    ['약속을 다음 주로 미룰 수 있을까요?', 'Can we put off our plans until next week?', 'put off', '미루다'],
  ],
  [
    ['이거 입어 봐도 돼요?', 'Can I try this on?', 'try on', '입어 보다'],
    ['카드로 계산할게요.', "I'll pay by card.", 'pay by card', '카드로 계산하다'],
    ['포장해 주세요.', 'Can I get this to go?', 'to go', '포장해서'],
    ['이거 할인 중인가요?', 'Is this on sale?', 'on sale', '할인 중인'],
    ['그냥 둘러보는 중이에요.', "I'm just looking around.", 'look around', '둘러보다'],
  ],
  [
    ['다시 한 번 말씀해 주시겠어요?', 'Could you say that again?', 'say that again', '다시 말하다'],
    ['무슨 말인지 알겠어요.', 'I see what you mean.', 'see what you mean', '무슨 말인지 알다'],
    ['제 생각은 좀 달라요.', 'I see it a little differently.', 'see it differently', '다르게 보다'],
    ['그거 좋은 생각이네요.', "That's a great idea.", 'great idea', '좋은 생각'],
    ['말 나온 김에, 저녁 뭐 먹을까요?', 'Speaking of which, what should we have for dinner?', 'speaking of which', '말 나온 김에'],
  ],
  [
    ['매일 조금씩 나아지고 있어요.', "I'm getting better little by little.", 'little by little', '조금씩'],
    ['포기하지 않을 거예요.', "I'm not going to give up.", 'give up', '포기하다'],
    ['이번엔 꼭 해낼 거예요.', "I'm going to make it this time.", 'make it', '해내다'],
    ['시간 날 때 책을 읽어요.', 'I read books in my free time.', 'free time', '여가 시간'],
    ['오늘 할 일을 다 끝냈어요.', 'I finished everything I had to do today.', 'have to do', '해야 하다'],
  ],
];
if (typeof module !== 'undefined') module.exports = DAYS;
