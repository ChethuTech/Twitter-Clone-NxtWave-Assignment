const express = require('express')
const app = express()
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const path = require('path')

app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')

module.exports = app

let db
const initializeDbAndServer = async () => {
  try {
    db = await open({filename: dbPath, driver: sqlite3.Database})
    app.listen(3000, () => console.log('Server Started Successfully'))
  } catch (e) {
    console.log(`DB Error : ${e.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

//middleWare Function1
const jwtTokenAuthorization = async (request, response, next) => {
  const authorization = request.headers['authorization']
  if (authorization === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    const jwtToken = authorization.split(' ')[1]
    jwt.verify(jwtToken, 'MY_SECRET_CODE', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        const userIdQuery = `
            SELECT user_id FROM user WHERE username = '${payload.username}';
          `
        let {user_id} = await db.get(userIdQuery)
        request.userId = user_id
        request.username = payload.username
        next()
      }
    })
  }
}

//API 1 Registerataion
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const checkUserInDbQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `
  const isUsernamePresentInDb = await db.get(checkUserInDbQuery)
  if (isUsernamePresentInDb !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    const registerUserQuery = `
      INSERT INTO user(name,username,password,gender)
      VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');      
    `
    await db.run(registerUserQuery)
    response.send('User created successfully')
  }
})

//API 2 Login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkUserInDbQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';
  `
  const isUsernamePresentInDb = await db.get(checkUserInDbQuery)
  if (isUsernamePresentInDb === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordValid = await bcrypt.compare(
      password,
      isUsernamePresentInDb.password,
    )
    if (isPasswordValid) {
      const payload = {username: username}
      const jwtToken = await jwt.sign(payload, 'MY_SECRET_CODE')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API 3
app.get(
  '/user/tweets/feed/',
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username
    const userIdQuery = `
      SELECT user_id FROM user WHERE username = '${username}';
    `
    let {user_id} = await db.get(userIdQuery)
    //user_id = 4 //ignore this line
    console.log(user_id)
    const latesttweetOfUserFollowingQuery = `
            SELECT user.username, tweet.tweet as tweet, tweet.date_time as dateTime
            FROM tweet
                  JOIN user ON user.user_id = tweet.user_id
            WHERE tweet.user_id IN (SELECT following_user_id
                                FROM follower
                                WHERE follower_user_id = ${user_id}
                                )
            ORDER BY tweet.date_time DESC
            LIMIT 4;
    `
    const userFollowing = await db.all(latesttweetOfUserFollowingQuery)
    response.send(userFollowing)
  },
)

//API 4
app.get(
  '/user/following/',
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username
    const userIdQuery = `
      SELECT user_id FROM user WHERE username = '${username}';
    `
    const user_id = await db.get(userIdQuery)
    const latesttweetOfUserFollowingQuery = `
      SELECT user.name
      FROM follower JOIN user ON follower.following_user_id = user.user_id
      WHERE follower_user_id = ${user_id.user_id};
      
    `
    const userFollowing = await db.all(latesttweetOfUserFollowingQuery)
    response.send(
      userFollowing.map(currentObject => {
        return {
          name: currentObject.name,
        }
      }),
    )
  },
)

//API 5
app.get(
  '/user/followers/',
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username
    const userIdQuery = `
      SELECT user_id FROM user WHERE username = '${username}';
    `
    const user_id = await db.get(userIdQuery)
    const latesttweetOfUserFollowingQuery = `
      SELECT user.name
      FROM follower JOIN user ON follower.follower_user_id = user.user_id
      WHERE following_user_id = ${user_id.user_id};
      
    `
    const userFollowing = await db.all(latesttweetOfUserFollowingQuery)
    response.send(
      userFollowing.map(currentObject => {
        return {
          name: currentObject.name,
        }
      }),
    )
  },
)

//    middleware function 2
const checkFollowersOfUser = async (request, response, next) => {
  const username = request.username
  const {tweetId} = request.params
  const userIdQuery = `
    SELECT user_id FROM user WHERE username = '${username}';
  `
  let {user_id} = await db.get(userIdQuery)
  //user_id = 2  //ignore this line //this was used to test the api

  const userFollowerQuery = `
    SELECT *
    FROM follower
          JOIN tweet on following_user_id = tweet.user_id  
                  
    WHERE follower_user_id = ${user_id} AND tweet.tweet_id = ${tweetId};
  `

  const userFollowing = await db.get(userFollowerQuery)
  console.log(userFollowing)
  if (userFollowing === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    request.user_id = user_id
    next()
  }
}

//API 6
app.get(
  '/tweets/:tweetId/',
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username
    const {tweetId} = request.params
    let userId = request.userId
    const toCheckUserFollowing = `
        SELECT *
        FROM tweet
        WHERE user_id IN (SELECT following_user_id 
                          FROM follower 
                          WHERE follower_user_id = ${userId}) AND tweet_id = ${tweetId};
    `
    const followingTweet = await db.get(toCheckUserFollowing)
    if (followingTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const tweetLikesAndRepliesQuery = `
          SELECT tweet, 
                (SELECT COUNT(*) FROM like where tweet_id = ${tweetId}) AS likes, 
                (SELECT COUNT(*) FROM reply where tweet_id = ${tweetId}) AS replies,
                date_time AS dateTime
          FROM tweet
          WHERE tweet_id = ${tweetId};
      `
      const tweet = await db.get(tweetLikesAndRepliesQuery)
      response.send(tweet)
    }
    console.log(`userId: ${userId}`)
    console.log(`tweetId: ${tweetId}`)
  },
)

//API 7 // Scroll to the bottom

//API 8
app.get(
  '/tweets/:tweetId/replies',
  jwtTokenAuthorization,
  checkFollowersOfUser,
  async (request, response) => {
    const {tweetId} = request.params
    let user_id = request.user_id

    const dbQuery = `
      SELECT user.name as name, reply
      FROM reply join user on reply.user_id = user.user_id
                  join tweet on reply.tweet_id = tweet.tweet_id
      WHERE reply.tweet_id = ${tweetId}
      ORDER BY date_time DeSC
      ;
  `
    const replies = await db.all(dbQuery)
    response.send({replies})
  },
)

//API 9 scroll to the bottom

//API 10
app.post('/user/tweets/', jwtTokenAuthorization, async (request, response) => {
  const username = request.username
  const {tweet} = request.body
  const userIdQuery = `
    SELECT user_id FROM user WHERE username = '${username}'; 
  `
  const {user_id} = await db.get(userIdQuery)
  const toTweetQuery = `
      INSERT INTO tweet(tweet,user_id)
      Values ('${tweet}', ${user_id});
  `
  await db.run(toTweetQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId',
  jwtTokenAuthorization,
  async (request, response) => {
    let {tweetId} = request.params
    tweetId = parseInt(tweetId)
    const username = request.username
    const userIdQuery = `
    SELECT user_id FROM user WHERE username = '${username}'; 
  `
    const {user_id} = await db.get(userIdQuery)

    const getAllTheTweetsOfUser = `
    SELECT tweet_id
    FROM tweet
    WHERE user_id = ${user_id};
  `
    let allTweetsOfUser = await db.all(getAllTheTweetsOfUser)
    allTweetsOfUser = allTweetsOfUser.map(currentObj => currentObj.tweet_id)
    const ifUsersTweet = allTweetsOfUser.includes(tweetId)

    if (ifUsersTweet) {
      const deleteQuery = `
      DELETE FROM tweet WHERE tweet_id = ${tweetId};
      `
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  jwtTokenAuthorization,
  async (request, response) => {
    const {tweetId} = request.params
    let userId = request.userId
    //userId = 1 // ignore this line //remember to change
    const checkingUserFollowing = `
      SELECT *
      FROM tweet
      WHERE tweet.user_id IN (SELECT following_user_id 
                                  FROM follower 
                                  WHERE following_user_id = ${userId}) AND tweet_id = ${tweetId};
    `
    const tweet = await db.get(checkingUserFollowing)
    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const likedUsersOfTweet = `
          SELECT user.username
          FROM like 
                JOIN USER ON like.user_id = user.user_id
          WHERE tweet_id = ${tweetId}
          ORDER BY date_time DeSC;
      `
      const allLikedUsersOfTweet = await db.all(likedUsersOfTweet)
      response.send({
        likes: allLikedUsersOfTweet.map(currentObj => currentObj.username),
      })
    }
  },
)

//API 9
app.get('/user/tweets/', jwtTokenAuthorization, async (request, response) => {
  const username = request.username
  const getUserIdFromDb = `
    SELECT user_id
    FROM user 
    WHERE username = "${username}";
  `
  let {user_id} = await db.get(getUserIdFromDb)
  //ignore this line //user_id = 4 //  remember to change Testing purpose

  const allTweetQuery = `
      SELECT 
              tweet.tweet, 
              COUNT(distinct like.like_id) AS likes,
              COUNT(distinct reply) AS replies, 
              tweet.date_time AS dateTime
      FROM tweet 
            LEFT JOIN like ON tweet.tweet_id = like.tweet_id
            LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.user_id = ${user_id}
      GROUP BY tweet.tweet
      ;
       
    `
  const tweets = await db.all(allTweetQuery)
  response.send(tweets)
})
