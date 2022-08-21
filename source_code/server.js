const express = require('express');
const app = express();

const json2html = require('json-to-html');

const { Datastore } = require('@google-cloud/datastore');
const ds = require('./datastore');

const bodyParser = require('body-parser');
const request = require('request');

const datastore = new Datastore();

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const BOAT = "Boat";
const LOAD = "Load";
const USER = "User";

const router = express.Router();
const login = express.Router();

const CLIENT_ID = 'C2aWOAP60SUKap0PzpLAoRh3MVUaHGAi';
const CLIENT_SECRET = 'bFupHx4_cqAYoj3SVsI7NURfULh6XqU0FY_GWqJVRX0ZCvAPyzOvy9iw2TtW0r_E';
const DOMAIN = 'project7-zhaoso.us.auth0.com';

app.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}
const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),

    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
});

function checkJwt_post() {
    return [jwt(
        {
            secret: jwksRsa.expressJwtSecret({
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 5,
                jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
            }),

            // Validate the audience and the issuer.
            issuer: `https://${DOMAIN}/`,
            algorithms: ['RS256']
        }),
    function (err, req, res, next) {
        res.status(401).end();
    }
    ]
}

function checkJwt_get() {
    return [jwt(
        {
            secret: jwksRsa.expressJwtSecret({
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 5,
                jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
            }),

            // Validate the audience and the issuer.
            issuer: `https://${DOMAIN}/`,
            algorithms: ['RS256']
        }),
        function(err, req, res, next){
            get_all_public_boats().then((pub_boats) => {
                res.status(200).send(pub_boats); 
            }); 
        }
    ]
}

/* ------------- Begin Boat Model Functions ------------- */
/*----------------Create a boat---------------*/
function post_boat(req, name, type, length, owner) {
    var key = datastore.key(BOAT)
    const new_boat = { "name": name, "type": type, "length": length, "loads": [], "owner": owner };
    return datastore.save({ "key": key, "data": new_boat }).then(() => {
        return datastore.get(key)
    }).then((boat) => {
        let boat_id = key.id;
        var id_element = { "id": boat_id };
        var boat_with_id = Object.assign(boat[0], id_element);
        return boat_with_id
    }).then((boat) => {
        var self_boat_url = req.protocol + "://" + req.get("host") + req.baseUrl + "/boats/" + key.id;
        var self_element = { "self": self_boat_url };
        var boat_with_self = Object.assign(boat, self_element);
        return datastore.save({ "key": key, "data": boat_with_self })
    }).then(() => {
        return datastore.get(key)
    })
}

/*---------------View all boat belongs to the current logged in user-------------*/
function get_boats(req, owner) {
    var q = datastore.createQuery(BOAT).limit(5);
    const results = {};
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        results.boats = entities[0].map(ds.fromDatastore).filter(item => item.owner === owner);
        if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

// function get_boats(req, owner){
//     const q = datastore.createQuery(BOAT).limit(5);
//     return datastore.runQuery(q).then((entities) => {
//         return entities[0].map(fromDatastore).filter(item => item.owner === owner);
//     }); 
// }

/*---------------View a boat-------------*/
function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. 
            console.log("bad: ", entity[0])
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            console.log("good: ", entity)
            return entity;
        }
    });
}

/*---------------Update a boat-------------*/
function put_boat(id, name, type, length){
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    console.log("key in function: " + key)
    // const boat = {"name": name, "type": type, "length": length};
    // return datastore.save({"key": key, "data": boat}).then(() => {return boat})
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. 
            return entity[0];
        } else {
            const boat = {"id":entity[0].id,"name": name, "type": type, "length": length, "loads": entity[0].loads, "owner": entity[0].owner, "self":entity[0].self };
            return datastore.save({"key": key, "data": boat}).then(() => {return boat})
        }
    });    
}

/*---------------Delete a boat-------------*/
function delete_boat(id, owner_id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. 
            return entity;
        }else if (owner_id!= (entity[0]).owner){
            console.log("owner_id:", owner_id)
            return "WRONG_OWNER"
        }else {            
            return remove_loads_in_boat(id).then((msg) => {
                console.log("done remove");
                return datastore.delete(key)
            });
        }
    });
}

function remove_loads_in_boat(id){
    const key = datastore.key([BOAT, parseInt(id, 10)]);  
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. 
            return entity;
        } else {
            //remove deleted boat in load
            console.log("here-----", entity[0])
            all_loads = entity[0]["loads"];
            console.log(all_loads);
            for (var i=0; i<all_loads.length; i++){
                curr_load_id = all_loads[i].id;
                remove_load(id, curr_load_id);
            }            
        }
    });
}


/*---------------Remove load from boat-------------*/
function remove_load(boat_id, load_id) {
    console.log("load_id: ", load_id)
    console.log("boat_id: ", boat_id)
    
    const load_key = datastore.key([LOAD, parseInt(load_id, 10)]);
    const boat_key = datastore.key([BOAT, parseInt(boat_id, 10)]);

    return datastore.get(boat_key).then((boat) =>{
        //Invalid boat id
        if (boat[0] === undefined || boat[0] === null) {
            // No boat found. 
            console.log("can't find boat: ", boat)
            return boat[0];
        }        
        return datastore.get(load_key).then((load) => {
            if (load[0] === undefined || load[0] === null) {
                console.log("can't find load: ", load)
                // No load found. 
                return load[0];
            } 
            //Find load, but no such boat_id is parked in here
            curr_load = load[0];
            curr_carrier = curr_load["carrier"];   

            if ((curr_carrier == null) || curr_carrier["id"] !== boat_id){
                console.log("find load but not on boat: ", load)
                return "NO_SUCH_LOAD_ON_BOAT";
            }
            //Find load and the boat
            else {
                console.log("boat before: ", boat);
                var curr_loads = boat[0]["loads"]
                console.log("curr_loads before: ", curr_loads);
                var updated_loads = curr_loads.filter(load => load.id !== load_id );
                console.log("load after: ", JSON.stringify(updated_loads));
                //update boad's loads
                boat[0].loads = updated_loads;
                console.log("------boat[0]", boat[0]); 
                //update load's carrier
                load[0].carrier = null;
                console.log("load[0] carrier should be null", load[0])                
                return datastore.save({"key": load_key, "data": load[0]})
                .then(() => {return datastore.save({"key": boat_key, "data": boat[0]})})
                .then(() => {return boat[0]});                
            }
    });
});
}


/* ------------------------------------- Begin add/remove load to/from boat Functions ----------------------------- */

/*---------------Assign a load to a boat-------------*/


/*---------------Add load to boat-------------*/
function add_load(boat_id, load_id) {
    console.log("boat_id: ", boat_id)
    console.log("load_id: ", load_id)

    const load_key = datastore.key([LOAD, parseInt(load_id, 10)]);
    const boat_key = datastore.key([BOAT, parseInt(boat_id, 10)]);

    return datastore.get(boat_key).then((boat) => {
        //Invalid boat id
        if (boat[0] === undefined || boat[0] === null) {
            // No boat found. 
            return boat[0];
        }
        return datastore.get(load_key).then((load) => {
            //Invalid load id
            if (load[0] === undefined || load[0] === null) {
                // No load found. 
                console.log("no load found");
                return load[0];
            }
            //Find load, but not already on another boat
            else if (load[0]["carrier"] != null) {
                console.log(load[0]["carrier"]);
                return "Occupied";
            }
            //Find load and empty
            else {
                console.log("find load and it's empty");
                if (typeof (boat[0].loads) === 'undefined') {
                    boat[0].loads = []
                }
                load_info = { "id": load_id, "self": load[0].self }
                boat[0].loads.push(load_info);
                carrier_info = {"id": boat_id, "name": boat[0]["name"], "self": boat[0]["self"]}
                load[0].carrier = carrier_info;
                
                console.log("Load After added carrier_info:", load);
                console.log("Load[0] After added carrier_info:", load[0]);
                return datastore.save({ "key": boat_key, "data": boat[0] }).then(()=>{
                    return datastore.save({ "key": load_key, "data": load[0] })
                })
            }
        });
    });
}


function get_loads_of_boat(req, boat_id){
    console.log(boat_id);
    const key = datastore.key([BOAT, parseInt(boat_id,10)]);
    return datastore.get(key).then((boat) => {
    if (boat[0] === undefined || boat[0] === null) {
        // No boat found. 
        return boat[0];
    }
    console.log("0");    
    return datastore.get(key)
    .then((boats) =>{
        console.log("1");
        const loads = boats[0]["loads"]
        return loads
    }).then((loads) =>{
        console.log("14");
        return loads;
    });
})
}



/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

//Create the boat, return 201 status and set the owner of the boat to the value of the sub property in the JWT.
//For missing or invalid JWTs, return 401 status code.
router.post('/boats', checkJwt_post(), function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('Server only accepts application/json data.')
    }

    post_boat(req, req.body.name, req.body.type, req.body.length, req.user.sub)
        .then(boat => {
            console.log(boat)
            if (req.body.name == null || req.body.type == null || req.body.length == null || req.user.sub == null) {
                res.status(400).json({ 'Error': 'The request object is missing at least one of the required attributes' });
            }
            else {
                return res.status(201).json(boat[0]);
            }
        });
});

// Valid JWT: return all boats whose owner matches the sub property in the supplied JWT.
// NO JWT or Invalid JWT: return all public boats regardless of owner.
router.get('/boats', checkJwt_post(), function (req, res) {
    get_boats(req, req.user.sub).then((boats) => { res.status(200).json(boats) });
});

router.get('/boats/:boat_id', checkJwt_post(), function (req, res) {
    get_boat(req.params.boat_id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                // The 0th element is undefined. This means there is no boat with this id
                res.status(404).json({ "Error": "No boat with this boat_id exists" });
            } else {
                // Return the 0th element which is the boat with this id
                const accepts = req.accepts(['application/json']);
                if (!accepts) {
                    res.status(406).json({ "Error": "Can only provide application/json" });
                }else {
                // Return the 0th element which is the boat with this id
                res.status(200).json(boat[0]);
            }
        }
        });
})

router.put('/boats/:boat_id', checkJwt_post(), function (req, res) {
    put_boat(req.params.boat_id, req.body.name, req.body.type, req.body.length)
        //.then(res.status(200).end());
        .then(boat => {
            console.log("boat in router: ", boat)
            //console.log("boat[0] in router: ", boat[0])
            if (req.body.name == null || req.body.type == null || req.body.length == null) {
                res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
            } 
            else if (boat === undefined || boat === null) {
                res.status(404).json({ "Error": "No boat with this boat_id exists" });
            }
            else {
                res.status(200).json(boat);
            }
        });    
});

// Return all public boats for the specified owner_id regardless of whether the request 
// has a valid or invalid JWT or whether a JWT is missing.
router.get('/owners/:owner_id/boats', function (req, res) {
    get_boats_by_owner(req.params.owner_id)
        .then(boats => {
            res.status(200).json(boats);
        });
});



//Valid JWT + Owner of a boat: can delete that boat
router.delete('/boats/:boat_id',  checkJwt_post(), function (req, res) {
    //delete_boat(req.params.boat_id).then(res.status(204).end())
    delete_boat(req.params.boat_id, req.user.sub).then(boat => {
        console.log("del boat in router: ", boat)
        //console.log("del boat[data] in router: ", boat[0])
        if (boat[0] === undefined || boat[0] === null) {
            res.status(403).json({ "Error": "No boat with this boat_id exists" });
        }
        else if(boat === "WRONG_OWNER"){            
            res.status(403).json({ "Error": "Only the owner can delete the boat" });
        }
        else {
            res.status(204).json(boat[0]);
        }
    });
})

login.post('/', function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    var options = {
        method: 'POST',
        url: `https://${DOMAIN}/oauth/token`,
        headers: { 'content-type': 'application/json' },
        body:
        {
            grant_type: 'password',
            username: username,
            password: password,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        },
        json: true
    };
    request(options, (error, response, body) => {
        if (error) {
            res.status(500).send(error);
        } else {
            res.send(body);
        }
    });

});

/* ------------------------------------- Begin Load and Boat Controller Functions ----------------------------- */
router.put('/boats/:boat_id/loads/:load_id', function (req, res) {
    add_load(req.params.boat_id, req.params.load_id)
        .then(entity => {
            console.log("entity after add:", entity);
            if (entity === undefined || entity === null) {
                // The 0th element is undefined. This means there is no load or boat with this id
                res.status(404).json({ "Error": "The specified boat and/or load does not exist" });
            } else if (entity == "Occupied") {
                res.status(403).json({ "Error": "The load is already loaded on another boat" });
            } else {
                // Return the 0th element which is the load with this id
                res.status(204).end();
            }
        })
        .catch((error) => {
            console.error(error)});
});

router.get('/boats/:boat_id/loads', function (req, res) {
    get_loads_of_boat(req, req.params.boat_id)
        .then(loads =>{
            if (loads === undefined || loads === null) {
                // The 0th element is undefined. This means there is no load or boat with this id
                res.status(404).json({ "Error": "No boat with this boat_id exists" });
            }else{
            res.status(204).json(loads)
            }
        }).catch((error) => {
            console.error(error)});
});


router.delete('/boats/:boat_id/loads/:load_id', function (req, res) {
    remove_load(req.params.boat_id, req.params.load_id)
        .then(entity => {
            console.log("1. the returned entity: "+ JSON.stringify(entity))
            if (entity === undefined || entity === null) {
                // The 0th element is undefined. This means there is no load or boat with this id
                res.status(404).json({ "Error": "No boat with this boat_id is loaded with the load with this load_id" });
            } else if (entity == "NO_SUCH_LOAD_ON_BOAT") {
                console.log("2. the returned boat: "+ entity)
                res.status(404).json({ "Error": "No boat with this boat_id is loaded with the load with this load_id" });
            } else{    
                // Return the 0th element which is the load with this id
                console.log("3. the returned boat: "+ entity)
                res.status(204).end();
            }
        });
});

router.delete('/boats/', function (req, res) {
    res.set('Accept', 'GET');
    res.status(405).end().send("Not Acceptable");
});

/* ------------- Begin load Model Functions ------------- */

/*----------------Create a Load---------------*/
function post_load(req, volume, item, creation_date) {
    var key = datastore.key(LOAD);
    const new_load = { "volume": volume, "carrier": null, "item": item, "creation_date": creation_date };
    return datastore.save({ "key": key, "data": new_load }).then(() => { return datastore.get(key) })
        .then((load) => {
            var load_id = key.id;
            var load_id_element = { "id": load_id };
            var load_with_id = Object.assign(load[0], load_id_element);
            return load_with_id
        }).then((load) => {
            let self_link = req.protocol + "://" + req.get("host") + req.baseUrl + "/loads/" + key.id;
            var load_self_element = { "self": self_link };
            var load_with_self = Object.assign(load, load_self_element);
            return datastore.save({ "key": key, "data": load_with_self })
        }).then(() => {
            return datastore.get(key);
        });
}

/*----------------Update a Load---------------*/
function put_load(id, volume, item, creation_date) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);    
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. 
            return entity[0];
        } else {
            const load = {"id": entity[0].id, "volume": volume, "carrier": entity[0].carrier, "item": item, "creation_date": creation_date, "self":entity[0].self };
            return datastore.save({"key": key, "data": load}).then(() => {return load})
        }
    });    
}

function put_boat(id, name, type, length){
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. 
            return entity[0];
        } else {
            const boat = {"id":entity[0].id,"name": name, "type": type, "length": length, "loads": entity[0].loads, "owner": entity[0].owner, "self":entity[0].self };
            return datastore.save({"key": key, "data": boat}).then(() => {return boat})
        }
    });    
}


/*---------------View all loads-------------*/
function get_loads(req) {
    var q = datastore.createQuery(LOAD).limit(5);
    const results = {};
    var prev;
    if (Object.keys(req.query).includes("cursor")) {
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        results.items = entities[0].map(ds.fromDatastore);
        if (typeof prev !== 'undefined') {
            results.previous = prev;
        }
        if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

/*---------------View a load-------------*/
function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity;
        }
    });
}

/*---------------Delete a load-------------*/
function delete_load(load_id) {
    const key = datastore.key([LOAD, parseInt(load_id, 10)]);
    console.log(load_id)
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. 
            return entity[0];
        } else {
            console.log("here---:", entity[0])
            carrier = entity[0]["carrier"]
            if (carrier == null){return datastore.delete(key)}
            carrier_id = carrier["id"]
            return remove_load(carrier_id, load_id).then((msg) => {
                console.log("done remove");
                return datastore.delete(key)
            });
        }
    });
}

/*---------------Remove load from boat-------------*/
function remove_load(boat_id, load_id) {
    console.log("load_id: ", load_id)
    console.log("boat_id: ", boat_id)
    
    const load_key = datastore.key([LOAD, parseInt(load_id, 10)]);
    const boat_key = datastore.key([BOAT, parseInt(boat_id, 10)]);

    return datastore.get(boat_key).then((boat) =>{
        //Invalid boat id
        if (boat[0] === undefined || boat[0] === null) {
            // No boat found. 
            console.log("can't find boat: ", boat)
            return boat[0];
        }        
        return datastore.get(load_key).then((load) => {
            
            //curr_id = curr_carrier["id"];
            //Invalid load id
            if (load[0] === undefined || load[0] === null) {
                console.log("can't find load: ", load)
                // No load found. 
                return load[0];
            } 
            //Find load, but no such boat_id is parked in here
            curr_load = load[0];
            curr_carrier = curr_load["carrier"];   

            if ((curr_carrier == null) || curr_carrier["id"] !== boat_id){
                console.log("find load but not on boat: ", load)
                return "NO_SUCH_LOAD_ON_BOAT";
            }
            //Find load and the boat
            else {
                //var boat = boat[0]
                console.log("boat before: ", boat);
                var curr_loads = boat[0]["loads"]
                console.log("curr_loads before: ", curr_loads);
                //updated_loads = del_by_id(curr_loads, load_id);
                var updated_loads = curr_loads.filter(load => load.id !== load_id );
                console.log("load after: ", JSON.stringify(updated_loads));
                //update boad's loads
                boat[0].loads = updated_loads;
                console.log("------boat[0]", boat[0]); 
                //update load's carrier
                load[0].carrier = null;
                console.log("load[0] carrier should be null", load[0])                
                return datastore.save({"key": load_key, "data": load[0]})
                .then(() => {return datastore.save({"key": boat_key, "data": boat[0]})})
                .then(() => {return boat[0]});                
            }
    });
});
}
/* ------------- End Model Functions ------------- */


/* ------------- Begin Controller Functions ------------- */

router.get('/loads', function (req, res) {
    const loads = get_loads(req)
        .then((loads) => {
            res.status(200).json(loads);
        });
});

router.get('/loads/:load_id', function (req, res) {
    get_load(req.params.load_id)
        .then(load => {
            if (load[0] === undefined || load[0] === null) {
                // The 0th element is undefined. This means there is no load with this id
                res.status(404).json({ "Error": "No load with this load_id exists" });
            } else {
                // Return the 0th element which is the load with this id
                res.status(200).json(load[0]);
            }
        });
})

router.post('/loads/', function (req, res) {
    post_load(req, req.body.volume, req.body.item, req.body.creation_date)
        .then(load => {
            if (req.body.volume == null || req.body.item == null || req.body.creation_date == null) {
                res.status(400).json({ 'Error': 'The request object is missing at least one of the required attributes' });
            }
            else {
                res.status(201).json(load[0]);
            }
        });
});

router.put('/loads/:load_id', function (req, res) {
    put_load(req.params.load_id, req.body.volume, req.body.item, req.body.creation_date)
        .then(load => {
            if (req.body.volume == null || req.body.item == null || req.body.creation_date == null) {
                res.status(400).json({ 'Error': 'The request object is missing at least one of the required attributes' });
            }else if (load === undefined || load === null) {
                res.status(404).json({ "Error": "No load with this load_id exists" });
            }
            else {
                res.status(201).json(load);
            }
        });
});


router.delete('/loads/:load_id', function (req, res) {
    delete_load(req.params.load_id).then(load => {
        console.log("del boat in router: ", load)
        if (load === undefined || load === null) {
            res.status(404).json({ "Error": "No load with this load_id exists" });
        }
        else {
            res.status(204).json(load[0]);
        }
    });
});


/* ------------------------------------- Begin User Model Functions ----------------------------- */
/*----------------Create a user---------------*/
function post_user(req, id, fname, lname) {
    var key = datastore.key(USER)
    const new_user = { "id": id, "fname": fname, "lname": lname};
    return datastore.save({ "key": key, "data": new_user }).then(() => {
        return datastore.get(key)
    }).then(() => {
        return datastore.get(key)
    })
}

/*---------------View all user-------------*/
function get_users(req) {
    var q = datastore.createQuery(USER).limit(5);
    const results = {};
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        results.users = entities[0].map(ds.fromDatastore);
        if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

/* --------------------------------- Begin Controller Functions-------------------------- ------------- */
//Create a user, return 201 status and set the user id to the value of the sub property in the JWT.
//For missing or invalid JWTs, return 401 status code.
router.post('/users', checkJwt_post(), function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('Server only accepts application/json data.')
    }

    post_user(req, req.user.sub, req.body.fname, req.body.lname )
        .then(user => {
            console.log(user)
            if (req.body.lname == null || req.user.sub == null) {
                res.status(400).json({ 'Error': 'The request object is missing at least one of the required attributes' });
            }
            else {
                return res.status(201).json(user[0]);
            }
        });
});

// Show all users
router.get('/users', function (req, res) {
    const users = get_users(req)
        .then((users) => {
            res.status(200).json(users);
        });
});

/* ------------- End Controller Functions ------------- */


app.use('/', router);
app.use('/login', login);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});

