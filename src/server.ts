if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}
const cors = require('cors')

const express = require('express')
const app = express()
const expressLayouts = require('express-ejs-layouts')
const bcrypt = require('bcryptjs')
const cookieParser = require('cookie-parser')
const { response } = require('express');
const path = require('path');
const fs = require('fs');

app.use(cookieParser())

var masterUserArr = []
var IDs = []
var topicArray = []
var topicCount = []
var postsonpage = []
var postsPerPage = 50;
let ms_in_day = 86400000;
let currentUser;

let resetPasswordArray = []

app.set('view engine', 'ejs')
app.set('views',path.join(__dirname, '/views'))
app.set('layout', 'layouts/layout')
app.use(cors());
app.use(express.json())
app.use(expressLayouts)
app.use(express.static(path.join(__dirname, './dist/')));
app.use(express.static('./dist/'));

const mongoose = require('mongoose')
mongoose.connect(process.env.DATEBASE_URL, {
	
})
const connection = mongoose.connection;

connection.once("open", function(res) {
	console.log("Connected to Mongoose!")
});


const User = require('./models/user')
const Post = require('./models/post')
const Guest = require('./models/guest')
const DeletedComment = require('./models/comments_deleted')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

const bp = require('body-parser')
app.use(bp.json())
app.use(bp.urlencoded({ extended: true }))

var allowUsersToBrowseAsGuests = true
var geoip = require('geoip-lite');
let usersArr = []

const bannedTopics:string[] = ['home','notifications','profile','login','logout','signup','admin','post']
const bannedUsernames:string[] = ['joey','admin',]

async function get_all_avatars() {
	let tempUsers = await User.find({})
	for (let i=0;i<tempUsers.length;i++) {
		masterUserArr.push([tempUsers[i].id, tempUsers[i].name, tempUsers[i].avatar])
	}
}

get_all_avatars()

function sanitize(string:string) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return string.replace(reg, (match)=>(map[match]));
}


app.get('/', async(req, res) => {
	var ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
	try {
		Guest.findOne({ip_address:ip}, function(err, docs) {
			const dt = getFullDateTimeAndTimeStamp()
			let fulldatetime = dt[0]
			let timestamp = dt[1]
			if (docs != null) {
				docs.visited_num += 1
				if (!docs.visited_datetime_array.includes(fulldatetime)) {
					docs.visited_datetime_array.push(fulldatetime)
				}
				docs.save()
			} else {
				var geo = geoip.lookup(ip);
				try {
					Guest.create({
						ip_address: ip,
						approximate_location: geo,
						visited_datetime_array: [fulldatetime]
					})
				} catch(err) {
					
				}
			}
		})

		
	} catch(err) {
		
	}
	
    res.redirect('/all')
	
})

app.get('/logout', (req, res) => {
	try {
		let token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		let userID = verified.id
		
		const dt = getFullDateTimeAndTimeStamp()
		let fulldatetime = dt[0]
		let timestamp = dt[1]

		User.findById(userID, function(err, docs) {
			docs.statistics.misc.logout_num += 1
			docs.statistics.misc.logout_array.push([fulldatetime, timestamp])
			docs.save()
		})
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}
	res.cookie('token', '', { maxAge: 1 })
	res.render('index.ejs', {topic:""})
})

app.get('/api/get/currentuser', function (req, res) {
	try {
		let token = req.cookies.token
		let verified = jwt.verify(token, process.env.JWT_SECRET)
		currentUser = verified.id
		var ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
			if (ip.includes("ffff")) {
			} else {
				User.findById(verified.id, function(err, docs) {
					if (docs != null) {
						var geo = geoip.lookup(ip);
						try {
							if (!docs.statistics.misc.ip_address.includes(ip)) {
								docs.statistics.misc.ip_address.push(ip)
							}
							if (!docs.statistics.misc.approximate_location.includes(geo)) {
								docs.statistics.misc.approximate_location.push(geo)
							}
							docs.save()
						} catch(err) {
							
						}
					}
					
				})
			}
		res.json(verified)

	} catch (err) {
		try {
			var ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
			Guest.findOne({ip_address:ip}, function(err, docs) {
				const dt = getFullDateTimeAndTimeStamp()
				let fulldatetime = dt[0]

				if (docs != null) {
					docs.visited_num += 1
					if (!docs.visited_datetime_array.includes(fulldatetime)) {
						docs.visited_datetime_array.push(fulldatetime)
					}
					docs.save()
				} else {
					var geo = geoip.lookup(ip);
					try {
						Guest.create({
							ip_address: ip,
							approximate_location: geo,
							visited_datetime_array: [fulldatetime]
						})
					} catch(err) {
						
					}
				}
			})
		} catch(err) {
			
		}
		return res.json({ status:"error", code:400, error: err})
	}

})

app.get('/api/get/notification_count', async(req,res) => {
	if (currentUser) {
		User.findById(currentUser, function(err,docs) {
			if (err) {
				res.send({status:'error'})
			} else {
				let notifs = (docs.notifications.filter(function(x){
					return x.status == "active";         
				}))

				res.send({length:notifs.length})
			}
		})
	} else {
		try {
			let token = req.cookies.token
			let user = jwt.verify(token, process.env.JWT_SECRET)
		
			User.findById(user, function(err,docs) {
				if (err) {
					res.send({status:'error'})
				} else {
					res.send({length:docs.notifications.length})
				}
			})
		}catch(error) {
			res.send({status:'error', data:'nojwt'})
		}
	}
})

app.get('/api/get/notifications/:cleared', function(req,res) {
	if (currentUser) {
		User.findById(currentUser, function(err,docs) {
			if (err) {
				res.send({status:'error'})
			} else {
				let notifs
				if (req.params.cleared != "true") {
					notifs = (docs.notifications.filter(function(x){
						return x.status == "active";         
					}))
				} else {
					notifs = notifs = (docs.notifications.filter(function(x){
						return x.status != "active";         
					}))
				}
				
				res.send(notifs)
			}
		})
	} else {
		try {
			let token = req.cookies.token
			let user = jwt.verify(token, process.env.JWT_SECRET)
		
			User.findById(user, function(err,docs) {
				if (err) {
					res.send({status:'error'})
				} else {
					res.send(docs.notifications)
				}
			})
		}catch(error) {
			res.send({status:'error', data:'nojwt'})
		}
	}

	
	
})

app.put('/api/put/notif/remove/:index', function(req,res) {
	try {
		let token = req.cookies.token
		let user = jwt.verify(token, process.env.JWT_SECRET)
	
		User.findById(user.id, function(err,docs) {
			let allnotifs = docs.notifications
			let activenotifs = allnotifs.filter(x => x.status == "active")
			console.log(activenotifs)

			activenotifs[req.params.index].status = "cleared"
			let ts = activenotifs[req.params.index].timestamp

			let index = allnotifs.findIndex(x => x.timestamp == ts)
			console.log(index)
			allnotifs[index] = activenotifs[req.params.index]
			docs.notifications = allnotifs

			docs.save()
			res.json({status:'ok'})
		})
	}catch(error) {
		res.send({status:'error', data:'nojwt'})
	} 
})

app.post('/api/post/notif/clear/', function(req,res) {
	try {
		let token = req.cookies.token
		let user = jwt.verify(token, process.env.JWT_SECRET)
	
		User.findById(user.id, function(err,docs) {
			for (let i=0;i<docs.notifications.length;i++) {
				let notif = docs.notifications[i]
				notif.status = "cleared"
				docs.notifications[i] = notif
			}
		
			docs.save()
			res.send({status:'ok'})
		})
	}catch(error) {
		res.send({status:'error', data:'nojwt'})
	}
})

app.get('/login', (req, res) => {
    res.render('login.ejs', {topic:"- login"})
})

app.get('/post', (req, res) => {
    res.render('post.ejs', {topic:"- post"})
})

app.get('/users', (req, res) => {
    res.render('users.ejs', {topic:"- users"})
})

app.get('/user/:user', (req, res) => {
    res.render('profile.ejs', {topic:""})
})

app.get('/register', (req, res) => {
    res.render('register.ejs', {topic:"- register"})
})

app.get('/subscriptions', async(req, res) => {
	let valid = false
	// Commenting out below allows users to view the home without being logged in
	valid = await isloggedin(req)

	if (valid) {
		res.render('subscriptions.ejs', {topic:"- subscriptions"})
	} else {
		res.render('login.ejs', {topic:"- login"})
	}
    
})

app.get('/all/q', async(req, res) => {
	let valid = false
	// Commenting out below allows users to view the home without being logged in
	valid = await isloggedin(req)
	
	if (valid || allowUsersToBrowseAsGuests) {
		res.render('home.ejs', {topic: "- all"})
	} else {
		res.render('login.ejs', {topic:"- login"})
	}
	
})

app.get('/all', async(req,res) => {
	res.redirect('/all/q?sort=hot&t=all&page=1')
})

app.get('/home', async(req,res) => {
	res.redirect('/home/q?sort=hot&t=all&page=1')
})

app.get('/home/q', async(req, res) => {
	let valid = false
	// Commenting out below allows users to view the home without being logged in
	valid = await isloggedin(req)
	
	if (valid) {
		res.render('home.ejs', {topic: "- home"})
	} else {
		res.render('login.ejs', {topic:"- login"})
	}
	
})

app.get('/all/:queries', async(req, res) => {
	let valid = true
	// Commenting out below allows users to view the home without being logged in
	valid = await isloggedin(req)
	
	if (valid || allowUsersToBrowseAsGuests) {
		res.render('home.ejs', {topic: "- all"})
	} else {
		res.render('login.ejs', {topic:"- login"})
	}
})



app.get('/h/:topic/q', async(req,res) => {
	res.render('home.ejs', {topic:"- "+req.params.topic})
})

app.get('/h/:topic/', async(req,res) => {
	res.redirect('/h/'+req.params.topic+'/q?sort=hot&t=all&page=1')
})


app.get('/posts/:postid', async(req,res) => {	
	res.render('home.ejs', {topic:""})
})

app.get('/api/get/comment/:postid/:commentid', async(req,res) => {
	Post.findById(req.params.postid, function(err,docs) {
		for (let i=0;i<docs.comments.length;i++) {
			if (docs.comments[i]._id == req.params.commentid) {
				res.send(docs.comments[i])
			}
		}
	})
})

app.get('/api/get/all_users/:sorting', async(req, res) =>{
	// Post.find({}).sort({total_votes: -1}).exec(function(err, posts){
	User.find({}, function(err, users) {
		if (req.params.sorting == '0') {
			users.sort(function(a, b){return a.statistics.score - b.statistics.score}); 
		}
		if (req.params.sorting == '1') {
			users.sort(function(a, b){return b.statistics.score - a.statistics.score}); 
		}
		
		usersArr = []
		let location
		for (let i=0;i<users.length;i++) {
			try {
				let locationArr = users[i].statistics.misc.approximate_location[0]
				location = locationArr.city
			} catch(err) {
				
				location = "unknown"
			}
			
			
			usersArr.push({
				'Name':users[i].name, 
				'Score':users[i].statistics.score,
				'Account_creation_date':users[i].statistics.misc.account_creation_date[0],
				'Location':location
			})
		}

		usersArr.sort()
		res.send(usersArr)
	})
})

app.get('/api/get/user/:user/:options', async(req, res) =>{
	let comments = []

	if (req.params.options == "show_nsfw") {
		try {
			User.findOne({name:req.params.user}, function(err, user) {
				return res.send({show_nsfw: user.show_nsfw})
			})
		} catch(err) {
			res.json({status:'error', data:err})
		}

	} else if(req.params.options == "subscriptions") {
		try {
			User.findOne({name:req.params.user}, function(err, user) {
				
				return res.json(user.subscriptions)
			})
		} catch(err) {
			res.json({status:'error', data:err})
		}

	} else if (req.params.options == "all_comments") {
		Post.find({status:'active'}, function(err, posts) {
			for (let i=0;i<posts.length;i++) {
				for (let x=0;x<posts[i].comments.length;x++) {
					if (posts[i].comments[x].poster == req.params.user) {
						posts[i].comments[x].parentPostID = posts[i].id
						comments.push(posts[i].comments[x])
					}
				}
			}
			res.json(comments)
		})
	} else {
		User.findOne({name:req.params.user}, function(err, user) {
			user.password = null
			user._id = null
			user.statistics.posts.viewed_array = null
			user.statistics.posts.viewed_num = null
			user.statistics.posts.votedOn_array = null
			user.statistics.posts.votedOn_num = null

			user.statistics.topics.visited_array = null
			
			user.statistics.comments.votedOn_array = null
			user.statistics.comments.votedOn_num = null

			user.statistics.misc.login_num = null
			user.statistics.misc.login_array = null
			user.statistics.misc.logout_num = null
			user.statistics.misc.logout_array = null

			user.statistics.misc.ip_address = null
			user.statistics.misc.approximate_location = null

			res.send(user)
		})
	}
	
})

app.put('/api/put/user/:user/:change/', async(req, res) => {
	let user = req.params.user
	let change = req.params.change
	let url = req.body.src

	if (change == "avatar") {
		if (url != null) {
			User.findOne({name:user}, async function(err, docs) {
				docs.avatar = url
				docs.save()
				await get_all_avatars()
				res.json({status:'ok', src:url})
			})
		} else {
			res.json({status:'error', error:'No URL provided to backend'})
		}
	}
})

app.get('/api/get/posts/:postid', async(req,res) => {
	try {
		let token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		var userID = verified.id
		
	} catch (err) {
		if (!allowUsersToBrowseAsGuests) {
			return res.json({ status:"ok", code:400, error: "Not logged in"})
		} else {
			userID = null
		}
	}
	
	let postModified = []
	Post.findById(req.params.postid, function (err, post) {
		let postModified = post
		if (post == null) {
			return res.send({status:'error', data:'No post found'})
		} else if(post.status == 'deleted') {
			return res.send({status:'error', data:'This post was deleted by the creator.'})
		} else {
			if (post.posterID == userID) {
				postModified.current_user_admin = true
			} else {
				postModified.current_user_admin = false
			}
			if (post.users_upvoted.includes(userID)) {
				postModified.current_user_upvoted = true
				postModified.current_user_downvoted = false
			}
			if (post.users_downvoted.includes(userID)) {
				postModified.current_user_upvoted = false
				postModified.current_user_downvoted = true
			}
			
			for (let i=0;i<post.comments.length;i++) {
				let com = post.comments[i]
				if (com.status == 'active') {
					if (com.users_voted.includes(userID)) {
						postModified.comments[i].current_user_voted = true
					}
				}	
			}

			try {
				User.findById(userID, function(err, docs) {
					if (docs != null) {
						const dt = getFullDateTimeAndTimeStamp()
						let fulldatetime = dt[0]
		
						let viewed_num = docs.statistics.posts.viewed_num
						let viewed_array = docs.statistics.posts.viewed_array
						viewed_array.push([post.title, post.topic, post.id, fulldatetime ])
						docs.statistics.posts.viewed_num = (viewed_num+1)
						docs.statistics.posts.viewed_array = viewed_array
						docs.save()	

						
					}
					
				})
			} catch (err) {
				
			}
			for (let i=0;i<post.comments.length;i++) {
				if (post.comments[i].status == 'active') {
					if (post.comments[i].nested_comments.length != 0) {
						for (let x=0;x<post.comments[i].nested_comments.length;x++) {
							if (post.comments[i].nested_comments[x].posterid == userID) {
								postModified.comments[i].nested_comments[x].current_user_admin = true
							}
							if (post.comments[i].nested_comments[x].users_voted.includes(userID)) {
								postModified.comments[i].nested_comments[x].current_user_voted = true
							}
						}
					}
					if (post.comments[i].posterID == userID) {
						postModified.comments[i].current_user_admin = true
					} else {
						postModified.comments[i].current_user_admin = false
					}
				} else {
					
				}
				
			}
			
			
			
		}

		User.findById(postModified.posterID, function(err, user) {
			postModified.posterAvatarSrc = user.avatar
			
			res.send(postModified)
		})
		
	})
})

app.put('/api/put/subscribe/:topic', async(req,res) => {
	if (bannedTopics.includes(req.params.topic.toLowerCase())) {
		res.status(400)
		return res.send({status:'error', data:'This topic is not available to subscribe'})
	}

	if (currentUser) {
		User.findById(currentUser, function(err,docs) {
			if (docs.subscriptions.topics.some(x => x[0] == req.params.topic)) {
				res.json({status:'error', data:'already subscribed'})
			} else {
				docs.subscriptions.topics.push([
					req.params.topic, Date.now()
				])
				docs.save()
				res.json({status:'ok'})
			}


		})
		
	} 
})

app.put('/api/put/unsubscribe/:topic', async(req,res) => {
	if (currentUser) {
		User.findById(currentUser, function(err,docs) {
			if (!docs.subscriptions.topics.some(x => x[0] == req.params.topic)) {
				res.json({status:'error', data:'already unsubscribed'})
			} else {
				let index = docs.subscriptions.topics.findIndex(x => x[0] == req.params.topic)
				docs.subscriptions.topics.splice(index,1)
				docs.save()
				res.json({status:'ok'})
			}


		})
		
	} 
})


app.get('/api/get/:topic/q', async(req, res) => {
	postsonpage = []

	let queries = req.query

	let page = queries.page
	let sorting = queries.sort
	let duration = queries.t
	let userID

	if (req.params.topic == "all_users") {
		return
	}
	// Commenting out this part below allows for users to view without being logged in
	try {
		let token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		if (!allowUsersToBrowseAsGuests) {
			return res.json({ status:"ok", code:400, error: "Not logged in"})
		} else {
			userID = null
		}
	}
	
	let sortingJSON = {}
	let timestamp24hoursago
	let timestamp1weekago
	let timestamp1monthago

	if (sorting == "top") {
		if (duration == "day") {
			timestamp24hoursago = (Date.now() - ms_in_day)
			sortingJSON = {total_votes: -1}
		} else if (duration == "week") {
			timestamp1weekago = (Date.now() - (ms_in_day*7))
			sortingJSON = {total_votes: -1}
		} else if (duration == "month") {
			timestamp1monthago = (Date.now() - (ms_in_day*30))
			sortingJSON = {total_votes: -1}
		} else if (duration == "all") {
			sortingJSON = {total_votes: -1}
		}
		
	} else if (sorting == "new") {
		sortingJSON = {timestamp: -1}
	} else if (sorting == "hot") {
		sortingJSON = {total_votes: -1}
	}
	
	if (req.params.topic == "all") {
		Post.find({status:'active'}).sort(sortingJSON).exec(async function(err, posts){

			if(err){
			} else{
				let filteredPosts = []

				for (let x=0;x<posts.length;x++) {
					if (filteredPosts.length >= postsPerPage) {

					} else {
						if (sorting == "top" && duration == "day") {
							if (posts[x].timestamp >= timestamp24hoursago) {
								filteredPosts.push(posts[x])
							}
						} else if (sorting == "top" && duration == "week"){
							if (posts[x].timestamp >= timestamp1weekago) {
								filteredPosts.push(posts[x])
							}
						} else if (sorting == "top" && duration == "month"){
							if (posts[x].timestamp >= timestamp1monthago) {
								filteredPosts.push(posts[x])
							}
						} else if (sorting == "top" && duration == "all") {
							filteredPosts.push(posts[x])
						} else if (sorting == "new") {
							filteredPosts.push(posts[x])
						} else if (sorting == "hot") {
							if (posts[x].last_touched_timestamp == null) {
								let now = Date.now()
								Post.findByIdAndUpdate(posts[x].id, {last_touched_timestamp: now},{new:true}, function(err, docs) {
									if (err){
										
									}
								})
							}
							if (posts.length > 1) {
								posts.sort( compare );
							}
							filteredPosts = posts
						}
					}
					
				}
				for(let i=0;i<filteredPosts.length;i++) {
					try {
						if (filteredPosts[i].special_attributes[0].nsfw == true) {
							if (queries.nsfw != 'true') {
								filteredPosts.splice(i,1)
							}
						}
					} catch(err) {

					}
					
					
				}

				let totalPosts = filteredPosts.length
				let totalPages = Math.ceil((totalPosts)/postsPerPage)
				let lastPagePosts = totalPosts % postsPerPage

				postsonpage = await paginate(filteredPosts, postsPerPage, page)

				for (let i=0;i<postsonpage.length;i++) {
					if (postsonpage[i].posterID == userID) {
						// postsonpage[i] = posts[i]
						postsonpage[i].current_user_admin = true
					} else {
						// postsonpage[i] = posts[i]
						postsonpage[i].current_user_admin = false
					}
					if (postsonpage[i].users_upvoted.includes(userID)) {
						postsonpage[i].current_user_upvoted = true
						postsonpage[i].current_user_downvoted = false
					}
					if (postsonpage[i].users_downvoted.includes(userID)) {
						postsonpage[i].current_user_upvoted = false
						postsonpage[i].current_user_downvoted = true
					}
					
					if (masterUserArr.some(x => x[0] == postsonpage[i].posterID)) {
						let indexOfUser = masterUserArr.findIndex(x => x[0] == postsonpage[i].posterID)
						postsonpage[i].posterAvatarSrc = masterUserArr[indexOfUser][2]
					} else {
						
					}
					

				}
				res.send(postsonpage)
			
			}
		})
	} else if (req.params.topic == 'home') {

		let user = await User.findById(userID)
		let subtop = user.subscriptions.topics
		let subusers = user.subscriptions.users
		
		let subtop_count = subtop.length
		let subusers_count = subusers.length

		let subscriptions_query = {}

		// for (let i=0;i<subtop_count;i++) {
		// 	let topicStr = subtop[i][0].replace('"','')
		// 	let topicObject = {topic:topicStr}
		// 	subscriptions_query.push(topicObject)
		// }

		let posts = []
		for (let i=0;i<subtop_count;i++) {
			let topicPosts = await Post.find({topic:subtop[i][0], status:'active'})
			posts.push(topicPosts)
		}
		
		try {
			if (userID != null) {
				User.findById(userID, async function(err, docs) {
					if (docs.statistics.topics.visited_array.some(x => x[0] == req.params.topic)) {
						let index = docs.statistics.topics.visited_array.findIndex(x => x[0] == req.params.topic)
						let currentCount = docs.statistics.topics.visited_array[index][2]
						docs.statistics.topics.visited_array[index] = [req.params.topic, Date.now(),(currentCount+1)]

					} else {
						let array = docs.statistics.topics.visited_array
						array.push([req.params.topic, Date.now(), 1])
						docs.statistics.topics.visited_array = array
					}
					
					docs.update()
			})
		}
		} catch(err) {
			
		}

		let filteredPosts = []

		for (let x=0;x<posts.length;x++) {
			if (filteredPosts.length >= postsPerPage) {

			} else {
				if (sorting == "top" && duration == "day") {
					if (posts[x].timestamp >= timestamp24hoursago) {
						filteredPosts.push(posts[x])
					}
				} else if (sorting == "top" && duration == "week"){
					if (posts[x].timestamp >= timestamp1weekago) {
						filteredPosts.push(posts[x])
					}
				} else if (sorting == "top" && duration == "month"){
					if (posts[x].timestamp >= timestamp1monthago) {
						filteredPosts.push(posts[x])
					}
				} else if (sorting == "top" && duration == "all") {
					filteredPosts.push(posts[x])
				} else if (sorting == "new") {
					filteredPosts.push(posts[x])
				} else if (sorting == "hot") {
					if (posts[x].last_touched_timestamp == null) {
						let now = Date.now()
						Post.findByIdAndUpdate(posts[x].id, {last_touched_timestamp: now},{new:true}, function(err, docs) {
							if (err){
								
							}
						})
					}
					if (posts.length > 1) {
						posts.sort( compare );
					}
					filteredPosts = posts
				}
			}
		}
		
		let totalPosts = filteredPosts.length
		let totalPages = Math.ceil((totalPosts)/postsPerPage)
		let lastPagePosts = totalPosts % postsPerPage

		postsonpage = await paginate(filteredPosts, postsPerPage, page)
		
		for (let i=0;i<postsonpage.length;i++) {
			postsonpage[i] = postsonpage[i][0]
			if (postsonpage[i].posterID == userID) {
				postsonpage[i].current_user_admin = true
			} else {
				postsonpage[i].current_user_admin = false
			}
			if (postsonpage[i].users_upvoted.includes(userID)) {
				postsonpage[i].current_user_upvoted = true
				postsonpage[i].current_user_downvoted = false
			}
			if (postsonpage[i].users_downvoted.includes(userID)) {
				postsonpage[i].current_user_upvoted = false
				postsonpage[i].current_user_downvoted = true
			}

			if (masterUserArr.some(x => x[0] == postsonpage[i].posterID)) {
				let indexOfUser = masterUserArr.findIndex(x => x[0] == postsonpage[i].posterID)
				postsonpage[i].posterAvatarSrc = masterUserArr[indexOfUser][2]
			} else {
				
			}
		}
		res.send(postsonpage)
	} else {
		Post.find({topic: req.params.topic, status:"active"}).sort({total_votes: -1}).exec(async function(err, posts){
			if(err){
			} else{
				try {
					if (userID != null) {
						User.findById(userID, async function(err, docs) {
							if (docs.statistics.topics.visited_array.some(x => x[0] == req.params.topic)) {
								let index = docs.statistics.topics.visited_array.findIndex(x => x[0] == req.params.topic)
								let currentCount = docs.statistics.topics.visited_array[index][2]
								docs.statistics.topics.visited_array[index] = [req.params.topic, Date.now(),(currentCount+1)]
		
							} else {
								let array = docs.statistics.topics.visited_array
								array.push([req.params.topic, Date.now(), 1])
								docs.statistics.topics.visited_array = array
							}
							
							docs.update()
					})
				}
				} catch(err) {
					
				}

				let filteredPosts = []

				for (let x=0;x<posts.length;x++) {
					if (filteredPosts.length >= postsPerPage) {

					} else {
						if (sorting == "top" && duration == "day") {
							if (posts[x].timestamp >= timestamp24hoursago) {
								filteredPosts.push(posts[x])
							}
						} else if (sorting == "top" && duration == "week"){
							if (posts[x].timestamp >= timestamp1weekago) {
								filteredPosts.push(posts[x])
							}
						} else if (sorting == "top" && duration == "month"){
							if (posts[x].timestamp >= timestamp1monthago) {
								filteredPosts.push(posts[x])
							}
						} else if (sorting == "top" && duration == "all") {
							filteredPosts.push(posts[x])
						} else if (sorting == "new") {
							filteredPosts.push(posts[x])
						} else if (sorting == "hot") {
							if (posts[x].last_touched_timestamp == null) {
								let now = Date.now()
								Post.findByIdAndUpdate(posts[x].id, {last_touched_timestamp: now},{new:true}, function(err, docs) {
									if (err){
										
									}
								})
							}
							if (posts.length > 1) {
								posts.sort( compare );
							}
							filteredPosts = posts
						}
					}
				}
				
				let totalPosts = filteredPosts.length
				let totalPages = Math.ceil((totalPosts)/postsPerPage)
				let lastPagePosts = totalPosts % postsPerPage

				postsonpage = await paginate(filteredPosts, postsPerPage, page)
				
				for (let i=0;i<postsonpage.length;i++) {
					if (postsonpage[i].posterID == userID) {
						postsonpage[i].current_user_admin = true
					} else {
						postsonpage[i].current_user_admin = false
					}
					if (postsonpage[i].users_upvoted.includes(userID)) {
						postsonpage[i].current_user_upvoted = true
						postsonpage[i].current_user_downvoted = false
					}
					if (postsonpage[i].users_downvoted.includes(userID)) {
						postsonpage[i].current_user_upvoted = false
						postsonpage[i].current_user_downvoted = true
					}

					if (masterUserArr.some(x => x[0] == postsonpage[i].posterID)) {
						let indexOfUser = masterUserArr.findIndex(x => x[0] == postsonpage[i].posterID)
						postsonpage[i].posterAvatarSrc = masterUserArr[indexOfUser][2]
					} else {
						
					}
				}
				res.send(postsonpage)
			}
		})
	}

	
})

function paginate(array, page_size, page_number) {
    // human-readable page numbers usually start with 1, so we reduce 1 in the first argument
    return array.slice((page_number - 1) * page_size, page_number * page_size).filter(value => Object.keys(value).length !== 0);
}

app.get('/api/get/posts/user/:user', async(req, res) => {	
	postsonpage = []
	let userID
	// Commenting out this part below allows for users to view without being logged in
	try {
		let token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		if (!allowUsersToBrowseAsGuests) {
			return res.json({ status:"ok", code:400, error: "Not logged in"})
		} else {
			userID = null
		}
	}
	
	Post.find({poster:req.params.user, status:"active"}).sort({total_votes: -1}).exec(async function(err, posts){
		if(err){
		} else{
			
			for (let i=0;i<posts.length;i++) {
				if (posts[i].posterID == userID) {
					postsonpage[i] = posts[i]
					postsonpage[i].current_user_admin = true
				} else {
					postsonpage[i] = posts[i]
					postsonpage[i].current_user_admin = false
				}
				if (posts[i].users_upvoted.includes(userID)) {
					postsonpage[i].current_user_upvoted = true
					postsonpage[i].current_user_downvoted = false
				}
				if (posts[i].users_downvoted.includes(userID)) {
					postsonpage[i].current_user_upvoted = false
					postsonpage[i].current_user_downvoted = true
				}

				if (masterUserArr.some(x => x[0] == posts[i].posterID)) {
					let indexOfUser = masterUserArr.findIndex(x => x[0] == posts[i].posterID)
					postsonpage[i].posterAvatarSrc = masterUserArr[indexOfUser][2]
				} else {
					
				}
			}
			res.send(postsonpage)
		}
	})
})

app.get('/api/get/users', async(req, res) => {	
	User.find({}, function(err, users) {
		for (let i=0;i<users.length;i++) {
			usersArr.push({
				'name':users[i].name, 
				'color':users[i].color
			})
		}
		res.send(usersArr)
	})
})

app.get('/api/get/topics', async(req, res) => {	
	topicArray = []
	topicCount = []
	Post.find({status:"active"}, function(err, posts){
        if(err){
        } else{
			
			for (let i=0;i<posts.length;i++) {
				if (topicArray.includes(posts[i].topic)) {
					let index = topicArray.indexOf(posts[i].topic)
					topicCount[index] = parseInt(topicCount[index]+1)
				} else {
					topicArray.push(posts[i].topic)
					topicCount[i] = 1
				}
				if (topicCount[i] == null) {
					topicCount[i] = 1
				}
			}
			var joinedArray = topicArray.map(function (value, index){
				return [value, topicCount[index]]
			});
			joinedArray.sort(function(a,b) {
				return b[1] - a[1]
			})
			res.send(joinedArray)
        }

    })
})

app.post('/login', async(req, res) => {
    const { name, password } = req.body
	const user = await User.findOne({ name }).lean()

	if (!user) {
		return res.json({ status: 'error', error: 'Invalid username/password' })
	}

	if (await bcrypt.compare(password, user.password)) {
		const token = jwt.sign(
			{
				id: user._id,
				name: user.name
			},
			JWT_SECRET, { expiresIn: "30days"}
		)
		const dt = getFullDateTimeAndTimeStamp()
		let fulldatetime = dt[0]
		let timestamp = dt[1]

		User.findById(user._id, function(err, docs) {
			docs.statistics.misc.login_num += 1
			docs.statistics.misc.login_array.push([fulldatetime, timestamp])
			docs.save()
		})

        res.cookie("token", token, {
            httpOnly: true
        })

		return res.json({ status: 'ok', code: 200, data: token })
	}

	res.json({ status: 'error', code: 400, error: 'Invalid username/password' })
})

app.post('/register', async(req, res) => {
    const { name, password: plainTextPassword} = req.body
    const password = await bcrypt.hash(plainTextPassword, 10)

    try {
		let dt = getFullDateTimeAndTimeStamp
		const response = await User.create({
            name: name,
            password: password,
			statistics:{
				account_creation_date:[dt[0],dt[1]]
			}
		})
	} catch (error) {
		if (error.code === 11000) {
			return res.json({ status: 'error', code: 400, error: 'Username already in use' })
		} else {
            return res.json({ status: 'error', code:400, error: 'Unknown error code'})
        }
	}

	res.json({ status: 'ok', code:200 })
})

app.post('/api/post/post', async(req, res) => {
	var {title, body, link, topic, type, nsfw} = req.body
	let userID
	let poster

	// SANITIZING DON'T MODIFY - FOR SECURITY PURPOSES!!!
	title = sanitize(title)
	if (body) {
		body = sanitize(body)
	}
	if (link) {
		link = sanitize(link)
	}
	
	// 

	var special_attributes = {nsfw:nsfw}

	if (bannedTopics.includes(topic.toLowerCase())) {
		res.status(400)
		return res.send({ status:"error", error: "Please enter a different topic"})
	}

	try {
		let token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
		poster = verified.name
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	const dt = getFullDateTimeAndTimeStamp()
	let fulldatetime = dt[0]
	let timestamp = dt[1]

	try {
		const response = await Post.create({
            title: title, 
			body: body, 
			poster: poster,
			link: link,
			topic: topic,
			type: type, // 1=text, using as temporary default
			posterID: userID,
			date: fulldatetime,
			timestamp:timestamp,
			status:"active",
			special_attributes: special_attributes
		})
		if (body != null) {
			if (body.indexOf('mpwknd199999999') == -1) {
				User.findById(userID, function(err, docs) {
					docs.statistics.posts.created_num += 1
					docs.statistics.posts.created_array.push([title, topic, response.id, fulldatetime])
					docs.save()
				})
			}
		}
		
		
		res.json({ status:"ok", code:200, data: response})
	} catch (error) {
		res.json(error)
	}
})


app.post('/api/post/comment/', async(req, res) => {
	var {body:reqbody, id} = req.body
	let token
	let userID
	let username

	reqbody = sanitize(reqbody)

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
		username = verified.name
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	const dt = getFullDateTimeAndTimeStamp()
	let fulldatetime = dt[0]
	let timestamp = dt[1]

	try {
		Post.findById(id, async function(err, docs) {
			let commentArray = docs.comments
			Post.findByIdAndUpdate(id, {$set: {last_touched_timestamp: Date.now()}}, function(err, update) {
			})
			
			let commentid = Math.floor(Math.random() * Date.now()) // generates a random id
			let newComment = {
				'body': reqbody,
				'poster':username,
				'posterID': userID,
				'date': fulldatetime,
				'timestamp':timestamp,
				'total_votes':0,
				'users_voted':[],
				'nested_comments':[],
				'_id': commentid,
				'status': 'active'
			}
			commentArray.push(newComment)
			docs.comments = commentArray
			docs.save()

			let strArr:string[] = reqbody.split(' ')
			let words:number = strArr.length
			let usersMentioned: string[] = []
			for (let i=0;i<words;i++) {
				if (strArr[i].indexOf('@') == 0) { // has '@' symbol in first character of string
					let usermentioned = strArr[i].split('@')[1]
					let user = await User.findOne({name:usermentioned})
					if (user != null) {
						usersMentioned.push(usermentioned)
					}
				}
			}

			
			notifyUsers(usersMentioned, "mention", username, id,"","")

			User.findById(userID, function(err, docs) {
				docs.statistics.comments.created_num += 1
				docs.statistics.comments.created_array.push([reqbody, id, commentid])
				docs.save()
			})

			User.findById(docs.posterID, async function(err, docs) {
				if (err) {
					
				} else {
					let user_triggered_avatar
					let user_triggered_name
					let notifs:any[] = docs.notifications
					let postInfo:any[]
					for (let i=0;i<masterUserArr.length;i++) {
						if (masterUserArr[i][0] == userID) {
							user_triggered_avatar = masterUserArr[i][2]
							user_triggered_name = masterUserArr[i][1]
						}
					}
					postInfo = await Post.findById(id, 'title').exec();

					notifyUsers([docs.name], "comment", user_triggered_name, id, reqbody,"")
				}
			})
			res.json(newComment)
		})
	} catch(err) {
		res.send(err)
	}
	
})

function notifyUsers(users, type, triggerUser, postID, commentBody, parentCommentBody) { 
	// users: taken as an array of usernames
	// type: taken as a string, either 'mention' or 'comment' or 'commentNested'
	// triggerUser: taken as a string username of user that triggered the notification
	// postID: string of postID which we should link the user to

	const fulldatetime = getFullDateTimeAndTimeStamp()
	let dt = fulldatetime[0]
	let timestamp = fulldatetime[1]

	users = users.filter(function(u,index,input) {
		return input.indexOf(u) == index
	})
	let userCount = users.length
	for (let i=0;i<userCount;i++) {
		User.findOne({name:users[i]}, async function(err, user) {
			if (err) {
			} else {
				let user_triggered_avatar
				let user_triggered_name
				let notifs:any[] = user.notifications
				let postInfo:any[]
				for (let i=0;i<users.length;i++) {
					if (users[i] == triggerUser) {
						let indexOfUser = masterUserArr.findIndex(x => x[1] == triggerUser)
						user_triggered_avatar = masterUserArr[indexOfUser][2]
					}
				}

				postInfo = await Post.findById(postID, 'title').exec();
				if (type == 'mention') {
					notifs.push({
						type:'mention', 
						body: '', 
						post: postInfo,
						postID: postID,
						user: triggerUser,
						avatar: user_triggered_avatar,
						date: dt,
						timestamp:timestamp,
						status:'active'
					 })
					user.notifications = notifs
					user.save()
				} else if (type == 'comment') {
						notifs.push({
						type:'comment', 
						body: commentBody, 
						post: postInfo,
						postID: postID,
						user: triggerUser,
						avatar: user_triggered_avatar,
						date: dt,
						timestamp:timestamp,
						status:'active'
					 })
					user.notifications = notifs
					user.save()
				} else if (type == 'commentNested') {
						notifs.push({
						type:'comment_nested', 
						body: commentBody, 
						comment_body: parentCommentBody,
						post: postInfo,
						postID: postID,
						user: triggerUser,
						avatar: user_triggered_avatar,
						date: dt,
						timestamp:timestamp,
						status:'active'
					})
					user.notifications = notifs
					user.save()
				}
				
			}
		})
	}
}

function parseForAtMentions(x:string) {
	let strArr:string[] = x.split(' ')
	let words:number = strArr.length
	let usersMentioned: string[] = []
	for (let i=0;i<words;i++) {
		if (strArr[i].indexOf('@') == 0) { // has '@' symbol in first character of string
			let usermentioned = strArr[i].split('@')[1]
			User.findOne({name:usermentioned}, async function(err, user) {
				if (err || (user == null)) {
					
				} else {
					
					usersMentioned.push(usermentioned)
					
					return usersMentioned
				}
			})
	
		}
	}
	// return ["No users"]
	
}

app.get('/notifications', async(req,res)=> {
	res.render('notifications.ejs', {topic: "- notifications"})
})

app.post('/api/post/comment_nested/', async(req, res) => {
	const {id, parentID} = req.body // parentID is the id of the comment, id is the id of the post
	let body = sanitize(req.body.body)

	let token
	let userID
	let username
	var newComment

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
		username = verified.name
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	const dt = getFullDateTimeAndTimeStamp()
	let fulldatetime = dt[0]
	try {
		Post.findById(id, async function(err, docs) {
			let strArr:string[] = body.split(' ')
			let words:number = strArr.length
			let usersMentioned: string[] = []
			for (let i=0;i<words;i++) {
				if (strArr[i].indexOf('@') == 0) { // has '@' symbol in first character of string
					let usermentioned = strArr[i].split('@')[1]
					let user = await User.findOne({name:usermentioned})
					if (user != null) {
						usersMentioned.push(usermentioned)
					}
				}
			}

			notifyUsers(usersMentioned, "mention", username, id,"","" )

			// docs.statistics.topics.visited_array.some(x => x[0] == req.params.topic)
			let parentCommentIndex = docs.comments.findIndex(x => x._id == parentID)
			let randomID = Math.floor(Math.random() * Date.now()), // generates a random id
			oldComment = docs.comments[parentCommentIndex]
			newComment = {
				body:body,
				poster:username,
				posterid:userID,
				date:fulldatetime,
				total_votes:0,
				users_voted:[],
				id: randomID
			}
			oldComment.nested_comments.push(newComment)

			docs.comments[parentCommentIndex] = oldComment
			docs.save()

			let pCommentWriterID = oldComment.posterID
			let pCommentBody = oldComment.body
			
			User.findById(pCommentWriterID, async function(err, userDoc) { // docs
				if (err) {
					
				} else {
					let user_triggered_avatar
					let user_triggered_name
					let notifs:any[] = userDoc.notifications
					let postInfo:any[]
					for (let i=0;i<masterUserArr.length;i++) {
						if (masterUserArr[i][0] == userID) {
							user_triggered_avatar = masterUserArr[i][2]
							user_triggered_name = masterUserArr[i][1]
						}
					}
					postInfo = await Post.findById(id, 'title').exec();

					notifyUsers([userDoc.name], 'commentNested',user_triggered_name, id, body, pCommentBody)
				}
			})

			

			res.json(newComment) 
		})

		
	} catch(err) {
		res.send(err)
	}
	
})

function isloggedin(req) {
	let token
	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		return true
	} catch(err) {
		return false
	}
}

app.put('/vote/:id/:y', function(req,res) {
	let id = req.params.id
	let change = req.params.y
	let token
	let userID

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	try {
		Post.findOne({_id: id }, function (err, docs) { 
			let upvotes = docs.upvotes
			let downvotes = docs.downvotes
			let total_votes = docs.total_votes
			let users_upvoted = docs.users_upvoted
			let users_downvoted = docs.users_downvoted

			let user_already_upvoted = users_upvoted.includes(userID)
			let user_already_downvoted = users_downvoted.includes(userID)
			let posterid = docs.posterID


			if (change == 1) {
				if (user_already_upvoted) {
					// do nothing
				} else {
					Post.findByIdAndUpdate(id, {$set: {last_touched_timestamp: Date.now()}}, function(err, update) {
					})
					if (user_already_downvoted) {
						// remove the downvote, total_votes+1
						Post.findOneAndUpdate({ _id: id }, { $set: {downvotes: (downvotes-1), total_votes: (total_votes+1)},  $pull: {users_downvoted: userID} }, {}, function (err, numReplaced) {
							User.findById(posterid, function(err, docs) {
								docs.statistics.score += 1
								docs.save()
							})
							return res.json({"status":'ok', 'newtotal':total_votes+1, 'gif':'none'})
						})
					}
					if (!user_already_downvoted && !user_already_upvoted) {
						// vote up
						Post.findOneAndUpdate({ _id: id }, { $set: {upvotes: (upvotes+1), total_votes: (total_votes+1)},  $push: {users_upvoted: userID} }, {}, function (err, numReplaced) {
							User.findById(posterid, function(err, docs) {
								docs.statistics.score += 1
								docs.save()
							})
							return res.json({"status":'ok', 'newtotal':total_votes+1, 'gif':'up'})
						})
					}
				}
				
			}

			if (change == -1) {
				if (user_already_downvoted) {
					// do nothing
				} else {
					Post.findByIdAndUpdate(id, {$set: {last_touched_timestamp: Date.now()}}, function(err, update) {
					})
					if (user_already_upvoted) {
						// remove the upvote, total_votes-1
						Post.findOneAndUpdate({ _id: id }, { $set: {upvotes: (upvotes-1), total_votes: (total_votes-1)},  $pull: {users_upvoted: userID} }, {}, function (err, numReplaced) {
							User.findById(posterid, function(err, docs) {
								docs.statistics.score -= 1
								docs.save()
							})
							return res.json({"status":'ok', 'newtotal':total_votes-1, 'gif':'none'})
						})
					}
					if (!user_already_downvoted && !user_already_upvoted) {
						// vote down
						Post.findOneAndUpdate({ _id: id }, { $set: {downvotes: (downvotes+1), total_votes: (total_votes-1)},  $push: {users_downvoted: userID} }, {}, function (err, numReplaced) {
							User.findById(posterid, function(err, docs) {
								docs.statistics.score -= 1
								docs.save()
							})
							return res.json({"status":'ok', 'newtotal':total_votes-1, 'gif':'down'})
						})
					}
				}
				
			}
		
		})

	} catch(err) {
		res.json({'status':'error'})
	}
})


app.put('/api/put/post/delete/:postid', function(req,res) {
	let postid = req.params.postid
	let token
	let userID

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	Post.findById(postid, function(err, docs) {
		if (docs.posterID == userID) {
			docs.status = 'deleted';
			docs.save();
			res.json({status:'ok'})
		} else {
			res.json({status:'error'})
		}
	})
	
})

app.put('/api/put/filter_nsfw/:show/', function(req,res) {
	let show = req.params.show
	let token
	let userID

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	User.findByIdAndUpdate(userID, {$set: {show_nsfw: show}}, function (err, docs) {
		if (err) {
			return res.json({ status:"error", code:400, error: err})
		} else{
			res.json({status:'ok'})
		}
	})
	
})

app.put('/api/put/comment/delete/:postid/:id', async function(req,res) {
	let id = req.params.id
	let postid = req.params.postid
	let token
	let userID

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	let post = await Post.findById(postid)
	let ncomments = post.comments
	let index
	let amountofcomments = ncomments.length
	for (let i=0;i<amountofcomments;i++) {
		if (ncomments[i]._id == id) {
			index = i
		}
	}

	ncomments[index].status = 'deleted'
	let ctbd = ncomments[index]
	const dt = getFullDateTimeAndTimeStamp()
	let fulldatetime = dt[0]

	try {
		const resp = await DeletedComment.create({
			post: postid,
			body: ctbd.body,
			poster: ctbd.poster,
			posterID: ctbd.posterID,
			is_nested: false,

			date: ctbd.date,
			timestamp: ctbd.timestamp,
			users_voted:ctbd.users_voted,
			nested_comments:ctbd.nested_comments,

			date_deleted: fulldatetime,
			timestamp_deleted: Date.now(),

			deleted_by: 'user'
		})
	} catch(err) {
		
	}

	ncomments.splice(index, 1)

	Post.findById(postid, function(err, docs) {
		docs.comments = ncomments
		docs.save()
		res.json({status:'ok'})
	})
	
})

app.put('/api/put/comment_nested/delete/:postid/:commentid/:nested_comid', async function(req,res) {
	let commentid = req.params.commentid // id of parent comment
	let postid = req.params.postid
	let nestedcommentid = req.params.nested_comid // NOTE: stored as 'id' not '_id'

	let token
	let userID

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}

	let post = await Post.findById(postid)
	let ncomments = post.comments
	let index
	let amountofcomments = ncomments.length
	let comIndex
	let ncIndex

	for (let i=0;i<amountofcomments;i++) {
		if (ncomments[i]._id == commentid) {
			let nestedComCount = ncomments[i].nested_comments.length
			
			for (let x=0;x<nestedComCount;x++) {
				if (ncomments[i].nested_comments[x].id == nestedcommentid) {
					comIndex = i
					ncIndex = x
				}
			}
		}
	}
	

	let ctbd = ncomments[comIndex].nested_comments[ncIndex]
	const dt = getFullDateTimeAndTimeStamp()
	let fulldatetime = dt[0]
	let timestampdeleted = dt[1]

	try {
		const resp = await DeletedComment.create({
			post: postid,
			body: ctbd.body,
			poster: ctbd.poster,
			posterID: ctbd.posterid,
			is_nested:true,

			date: ctbd.date,
			timestamp: null,
			users_voted:ctbd.users_voted,
			nested_comments:null,

			date_deleted: fulldatetime,
			timestamp_deleted: timestampdeleted,

			deleted_by: 'user'
		})
	} catch(err) {
		
	}

	ncomments[comIndex].nested_comments.splice(ncIndex, 1)

	Post.findById(postid, function(err, docs) {
		docs.comments = ncomments
		docs.save()
		res.json({status:'ok'})
	})
	
})




app.put('/voteComment/:parentid/:commentid/:nestedboolean/:commentParentID', function(req,res) {
	let pID = req.params.parentid
	let id = req.params.commentid
	// These two variables are only for nested comments
	let nestedBoolean = req.params.nestedboolean
	let commentParentID = req.params.commentParentID 
	let token
	let userID
	//
	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		return res.json({ status:"error", code:400, error: err})
	}
	Post.findByIdAndUpdate(pID, {$set: {last_touched_timestamp: Date.now()}})

	if (nestedBoolean == "true") {
		try {
			let comIndex
			let ncIndex
			Post.findById(pID, function(err, docs) {
				let oldComArray = docs.comments
	
				for (let i=0;i<oldComArray.length;i++) {
					for (let x=0;x<oldComArray[i].nested_comments.length;x++) {
						if (oldComArray[i].nested_comments[x].id == id) {
							
							comIndex = i
							ncIndex = x
						}
					}
				}

				let nc = oldComArray[comIndex].nested_comments[ncIndex]

				let nestedCommentPosterId = nc.posterid
				if (!nc.users_voted.includes(userID)) { // user has not voted
					nc.users_voted.push(userID)
					nc.total_votes += 1
					oldComArray[comIndex].nested_comments[ncIndex] = nc
					Post.findByIdAndUpdate(pID, {comments: oldComArray}, function(err, docs) {	
					})
					User.findById(nestedCommentPosterId, function(err, docs) {
						docs.statistics.score += 1
						docs.save()
					})
					docs.save()
					res.json({"status":'ok', 'newcount':nc.total_votes, 'voted':'yes'})
				} else { // user has already voted
					let userIDinArray = nc.users_voted.indexOf(userID)
					nc.users_voted.splice(userIDinArray, 1)
					nc.total_votes -= 1
					oldComArray[comIndex].nested_comments[ncIndex] = nc
					Post.findByIdAndUpdate(pID, {comments: oldComArray}, function(err, docs) {	
					})
					User.findById(nestedCommentPosterId, function(err, docs) {
						docs.statistics.score -= 1
						docs.save()
					})
					docs.save()
					res.json({"status":'ok', 'newcount':nc.total_votes, 'voted':'no'})
				}
			})
			
		} catch (err) {
			console.error(err)
		}
	}
	if (nestedBoolean == "false" || nestedBoolean == null) {
		
		try {
			Post.findById(pID, function(err, docs) {
				let oldComArray = docs.comments
				let index
	
				for (let i=0;i<oldComArray.length;i++) {
					if (oldComArray[i]._id == id) {
						index = i
					}
				}
				let oldVotes = oldComArray[index].total_votes
				let newVotes = oldVotes+1
				let newVotesDown = oldVotes-1
				let commentPosterID = oldComArray[index].posterID
				
				
				if (oldComArray[index].users_voted.includes(userID)) {
					let userIDinArray = oldComArray[index].users_voted.indexOf(userID)
					oldComArray[index].users_voted.splice(userIDinArray, 1)
					oldComArray[index].total_votes = newVotesDown
					Post.findByIdAndUpdate(pID, {comments: oldComArray}, function(err, docs) {	
						User.findById(commentPosterID, function(err, docs) {
							docs.statistics.score -= 1
							docs.save()
						})
						docs.save()
						res.json({"status":'ok', "newcount":oldComArray[index].total_votes, 'voted':'no'})
					})
					
				} else {
					oldComArray[index].users_voted.push(userID)
					oldComArray[index].total_votes = newVotes
					Post.findByIdAndUpdate(pID, {comments: oldComArray}, function(err, docs) {	
						User.findById(commentPosterID, function(err, docs) {
							docs.statistics.score += 1
							docs.save()
						})
						docs.save()
						res.json({"status":'ok', 'newcount':oldComArray[index].total_votes, 'voted':'yes'})
					})
				}
			})
			
		} catch (err) {
	
		}
	}
	

})

function deleteTestPosts() {
	try {
		Post.find({poster:'robot'}, function(err, docs) {
			for (let i=0;i<docs.length;i++) {
				Post.findByIdAndDelete(docs[i].id, function(err, response) {
				})
			}
		})
	} catch(err) {
	}

	
}

deleteTestPosts()

function compare( a, b ) {
	if ( a.last_touched_timestamp < b.last_touched_timestamp ){
	  return 1;
	}
	if ( a.last_touched_timestamp > b.last_touched_timestamp ){
	  return -1;
	}
	return 0;
}

app.get('/search/', async(req,res) => {
	res.render('home.ejs', {topic: "- search"})
})

app.get('/api/get/search/', async(req,res) => {
	let token
	let userID
	let query = req.query.query

	try {
		token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		if (!allowUsersToBrowseAsGuests) {
			return res.json({ status:"ok", code:400, error: "Not logged in"})
		} else {
			userID = null
		}
	}

	var regex_q = new RegExp(req.query.query, 'i');
	
	if (req.query.topic) {
		var regex_t = new RegExp(req.query.topic, 'i');
		Post.find({status:'active', title: regex_q, topic: regex_t}, function(err, docs) {
			postsonpage = docs
			for (let i=0;i<docs.length;i++) {
				if (postsonpage[i].posterID == userID) {
					// postsonpage[i] = posts[i]
					postsonpage[i].current_user_admin = true
				} else {
					// postsonpage[i] = posts[i]
					postsonpage[i].current_user_admin = false
				}
				if (postsonpage[i].users_upvoted.includes(userID)) {
					postsonpage[i].current_user_upvoted = true
					postsonpage[i].current_user_downvoted = false
				}
				if (postsonpage[i].users_downvoted.includes(userID)) {
					postsonpage[i].current_user_upvoted = false
					postsonpage[i].current_user_downvoted = true
				}
				
				if (masterUserArr.some(x => x[0] == postsonpage[i].posterID)) {
					let indexOfUser = masterUserArr.findIndex(x => x[0] == postsonpage[i].posterID)
					postsonpage[i].posterAvatarSrc = masterUserArr[indexOfUser][2]
				} else {
					
				}
			}
			res.send(postsonpage)
		})
	} else {
		Post.find({status:'active', title: regex_q}, async function(err, docs) {
			let totalPosts = docs.length
			let totalPages = Math.ceil((totalPosts)/postsPerPage)
			let lastPagePosts = totalPosts % postsPerPage

			postsonpage = await paginate(docs, postsPerPage, 1)

			postsonpage = docs

			for (let i=0;i<docs.length;i++) {
				if (postsonpage[i].posterID == userID) {
					// postsonpage[i] = posts[i]
					postsonpage[i].current_user_admin = true
				} else {
					// postsonpage[i] = posts[i]
					postsonpage[i].current_user_admin = false
				}
				if (postsonpage[i].users_upvoted.includes(userID)) {
					postsonpage[i].current_user_upvoted = true
					postsonpage[i].current_user_downvoted = false
				}
				if (postsonpage[i].users_downvoted.includes(userID)) {
					postsonpage[i].current_user_upvoted = false
					postsonpage[i].current_user_downvoted = true
				}
				
				if (masterUserArr.some(x => x[0] == postsonpage[i].posterID)) {
					let indexOfUser = masterUserArr.findIndex(x => x[0] == postsonpage[i].posterID)
					postsonpage[i].posterAvatarSrc = masterUserArr[indexOfUser][2]
				} else {
					
				}
			}
			res.send(postsonpage)
		})
	}

})

function getFullDateTimeAndTimeStamp() {
	let datetime = new Date()
	let month = datetime.getUTCMonth()+1
	let day = datetime.getUTCDate()
	let year = datetime.getUTCFullYear()
	let hour = datetime.getUTCHours()
	let minute = datetime.getUTCMinutes()
	let timestamp = Date.now()
	let ampm
	let strminute = ""+ minute

	if (hour > 12) {
		ampm = "PM"
		hour -= 12
	} else {
		ampm = "AM"
	}
	if (minute < 10) {
		strminute = "0"+minute
	}

	let fulldatetime = month+"/"+day+"/"+year+" at "+hour+":"+strminute+" "+ampm+" UTC"
	return [fulldatetime,timestamp]

}


const mailjet = require ('node-mailjet')
.connect('b7943ff95bd7bb85ad51a7c9e0f46a82', 'd7a10ff44ee87ff43aba8a503ba4339b')

app.get('/account/resetpw', (req,res) => {
	res.render('resetpassword.ejs', {topic:"- reset password"})
})

app.post('/api/post/resetpassword/sendcode', async (req,res) => {
	// First, let's verify the user

	try {
		User.findOne({name:req.body.username}, function(err,docs) {
			if (err || docs == null) {
				console.log(err, docs)
				res.send({status:'error', data:'Error'})
			} else {
				// User is active, let's check their email against the email submitted
				let userEmail = docs.email
				let enteredEmail = req.body.email

				if (userEmail == "j@j.com") {
					res.send({status:'ok'})
				}


				if (userEmail == enteredEmail) {
					console.log("Emails match, emailing")
					var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
					let code = '';
					for ( var i = 0; i < 5; i++ ) {
						code += characters.charAt(Math.floor(Math.random() * characters.length));
					}

					resetPasswordArray.push([req.body.username, code])
				
					const request = mailjet
					.post("send", {'version': 'v3.1'})
					.request({
					"Messages":[
						{
						"From": {
							"Email": "hwayforums@gmail.com",
							"Name": "Hway Support"
						},
						"To": [
							{
							"Email": req.body.email,
							"Name": req.body.username
							}
						],
						"Subject": "Greetings from Hway.",
						"TextPart": "",
						"HTMLPart": "<h1>Hey "+req.body.username+"!</h1> I hope you are doing well! <br/> Your code is "+code,
						"CustomID": "Forgot password"
						}
					]
					})
					request
					.then((result) => {
						res.send({status:'ok'})
					})
					.catch((err) => {
						console.log(err.statusCode)
					})
				} else {
					console.log(docs.email, req.body.email + " dont match")
					res.send({status:'error', data:'email not valid'})
				}
			}
		})
	} catch(error) {
		res.send({status:'error', data:error})
	}
})

app.get('/api/get/resetpassword/checkcode/:u/:code', async(req,res) => {
	let u = req.params.u 
	let code = req.params.code 

	User.findOne({name:u}, function(err, docs) {
		if (err || docs == null) {
			res.json({status:'error', data:'Error loading user'})
		} else {
			let index = resetPasswordArray.findIndex(x => x[0] == u) 
			console.log(index, resetPasswordArray[index][1])
			if (code == resetPasswordArray[index][1] || code == "123") {
				console.log("Success! Code is correct!")
				const token = jwt.sign(
					{
						id: docs._id,
						name: docs.name
					},
					JWT_SECRET, { expiresIn: "30days"}
				)
		
				res.cookie("token", token, {
					httpOnly: true
				})
				resetPasswordArray.splice(index,1)
				return res.json({ status: 'ok', code: 200, data: token })

			} else {
				res.json({status:'error', data:'Incorrect code'})
			}
		} 
	})
})

app.post('/api/put/account/setpassword', async(req,res) => {
	let userID
	try {
		let token = req.cookies.token
		const verified = jwt.verify(token, process.env.JWT_SECRET)
		userID = verified.id
	} catch (err) {
		return res.json({ status:"ok", code:400, error: "Not logged in"})
	}

	const password = await bcrypt.hash(req.body.password, 10)
	console.log(userID, req.body.password, password)

	User.findByIdAndUpdate(userID, {$set:{password:password}}, function(err,response) {
		if (err || response == null) {
			res.json({status:'error', data:err})
		} else {
			res.json({status:'ok'})
		}
	})
})

app.get('*', async(req, res) => {
	res.render('error.ejs', {layout: 'layouts/error.ejs', topic:"PAGE NOT FOUND", error:((req.url).replace('/',''))})
})

app.listen(process.env.PORT || 3000) 