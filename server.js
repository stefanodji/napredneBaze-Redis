const express = require('express');
const expHandlebars = require('express-handlebars');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const redis = require('redis');
const fetch = require('node-fetch');
const { json } = require('body-parser');


//Create Redis Client
let client = redis.createClient();

client.on('connect', function(){
    console.log("Connected to Redis :)");
})

const port = 3000;


//Initializig Application
const app = express();

//Seetting up app
app.engine('handlebars', expHandlebars({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

app.use(express.static('public'));

app.use(express.urlencoded({extended:false}));
app.use(express.json());

app.use(methodOverride('_method'));





//Home Page
app.get('/', function(req, res){
    //arrayOfIndexes = [];
    res.render('homePage');
})


//Search Page
app.get('/searchStudents', function(req, res){
    res.render('searchStudents');
});

//Search Processing
app.post('/student/search', function(req, res){
    let indexNumber = req.body.indexNumber;
    console.log("Ovo je broj indexa: " + indexNumber);

    client.hgetall(indexNumber, function(error, objekat){
        if(!objekat){
            res.render('searchStudents', {
                error: "Student do not exist!"
            });
        }
        else{
            objekat.indexNumber = indexNumber;
            res.render('details', {
                user: objekat
            });
        }
    })
})

//Add New Student Page
app.get('/student/add', function(req, res){
    res.render('addStudent');
});


var arrayOfIndexes = [];

// Process Add Student Page
app.post('/student/add', function(req, res){
    let indexNumber = req.body.indexNumber;
    let firstName = req.body.firstName;
    let lastName = req.body.lastName;
    let email = req.body.email;
    let phoneNumber = req.body.phoneNumber;
    let gitUsername = req.body.gitUsername;

    arrayOfIndexes.push(indexNumber);

    console.log("Trenutno u nizu imamo : " + arrayOfIndexes.length + " studenata");

    

    client.hmset(indexNumber, [
        'firstName', firstName,
        'lastName', lastName,
        'email', email,
        'phoneNumber', phoneNumber,
        'gitUsername', gitUsername
    ], function(error, reply){
        if(error){
            console.log(error);
        }
        console.log(reply);
    });

    client.hgetall(indexNumber, function(error, objekat){
        if(!objekat){
            res.send('Server error: code 500');
        }
        else{
            objekat.indexNumber = indexNumber;
            res.redirect(`/student/${objekat.indexNumber}`);
        }
    })
});

function responseNoStudents() {
    return `<h1 style="margin: 50px auto 50px auto; text-align: center;">There is no students in the database. Please add one :)</h1>`
}

app.get('/student/all', function(req, res) {

    var arrayOfStudents = [];
    
    if(arrayOfIndexes.length === 0){
        res.send(responseNoStudents());
    }
    else{
        arrayOfIndexes.forEach(indexNumber => {
            client.hgetall(indexNumber, function(error, objekat){
                if(!objekat){
                    res.send('Server error: code 500');
                }
                else{
                    objekat.indexNumber = indexNumber;
                    arrayOfStudents.push(objekat);
                }
            })
        });
        res.render('allStudents', {
            arrayOfStudents: arrayOfStudents
        })
    }
    
})


//Initial Editing
app.get('/student/edit/:indexNumber', function(req, res){

    let indexNumber = req.params.indexNumber;

    client.hgetall(indexNumber, function(error, objekat){
        if(!objekat){
            res.send('Server error: code 500');
        }
        else{
            objekat.indexNumber = indexNumber;
            res.render('editStudent', {
                user: objekat
            });
        }
    })
})

//Edit Student
app.put('/student/:indexNumber', function(req, res){

    let indexNumber = req.body.indexNumber;
    let firstName = req.body.firstName;
    let lastName = req.body.lastName;
    let email = req.body.email;
    let phoneNumber = req.body.phoneNumber;
    let gitUsername = req.body.gitUsername;

    

    client.hmset(indexNumber, [
        'firstName', firstName,
        'lastName', lastName,
        'email', email,
        'phoneNumber', phoneNumber,
        'gitUsername', gitUsername
    ], function(error, reply){
        if(error){
            console.log(error);
        }
        console.log(reply);
    });

    client.hgetall(indexNumber, function(error, objekat){
        if(!objekat){
            res.send('Server error: code 500');
        }
        else{
            objekat.indexNumber = indexNumber;
            res.render('details', {
                user: objekat
            });
        }
    })
})

//Delete Student
app.delete('/student/delete/:indexNumber', function(req, res){
    client.del(req.params.indexNumber);
    const index = arrayOfIndexes.indexOf(req.params.indexNumber);
    if(index > -1){
        arrayOfIndexes.splice(index, 1);
    }

    console.log("Trenutno u nizu imamo : " + arrayOfIndexes.length + " studenata");
    
    res.redirect('/');

})


//Student info
app.get('/student/:indexNumber', function(req, res) {

    let indexNumber = req.params.indexNumber;

    client.hgetall(indexNumber, function(error, objekat){
        if(!objekat){
            res.render('searchStudents', {
                error: "Student do not exist!"
            });
        }
        else{
            objekat.indexNumber = indexNumber;
            res.render('details', {
                user: objekat
            });
        }
    })
})

//------------------------------------------------------------------------------------
//                        CACHING PART

function responseCustom(username, numberOfRepos){
    return `<div style="display: flex; justify-content: center">
        <h1 style="margin: 30px auto;"><span style="color: red; font-size: 50px">${username}</span> has ${numberOfRepos} GitHub repos!</h1>
    <div>`
}

function cache(req, res, next){
    const { username } = req.params;

    client.get(username, (error, data) => {
        if(error) throw error;

        if (data !== null){
            res.send(responseCustom(username, data))
        }
        else{
            next();
        }
    })
}

//Make request to GitHub for data
async function getRepos(req, res){
    try {
        console.log("Fetching data...");

        const { username } = req.params; //destructuring object :)

        const response = await fetch(`https://api.github.com/users/${username}`);
        const data = await response.json();
        const numberOfRepos = data.public_repos;

        console.log("Broj repos: " + numberOfRepos);

        if(numberOfRepos == undefined){
            res.send(`Username "${username}" doesn't exist!`);
        }else{
            client.setex(username, 60, numberOfRepos); //exparation because the data is changing constantly
        }

        res.send(responseCustom(username, numberOfRepos));

    } catch (error) {
        console.error(error);
        res.status(500);
    }
}

app.get('/student/repos/:username', cache, getRepos);


//------------------------------------------------------------------------------------------------


app.listen(port, function(){
    console.log("Server started on port " + port); 
})