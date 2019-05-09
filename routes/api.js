/*
*
*
*       Complete the API routing below
*
*
*/

"use strict";

const expect = require("chai").expect;
const MongoClient = require("mongodb");
const https = require("https");

const CONNECTION_STRING = process.env.DB; //MongoClient.connect(CONNECTION_STRING, function(err, db) {});

module.exports = function (app) {

  app.route("/api/stock-prices")
    .get(function (req, res){
      const stocks = typeof req.query.stock === "string" ? [ req.query.stock ] : req.query.stock;
      const markLiked = req.query.like === "true";
      const ip = req.headers["x-forwarded-for"].split(",")[0];
      const likes = {};

      let db;
      let stockDB;
      let stockData;

      MongoClient.connect(CONNECTION_STRING)
      .then(client => {
        db = client;
        stockDB = db.collection("stocks");
        const pArray = [];

        if (markLiked) {
          stocks.forEach(stock => {
            const doc = {
              stock: stock.toUpperCase(),
              ip: ip
            };

            pArray.push(
              stockDB.find(doc).count()
              .then(amount => {
                if (amount === 0) {
                  return stockDB.insertOne(doc);
                }
              })
            );
          });
        }

        return Promise.all(pArray);
      })
      .then(() => {
        const pArray = [];

        stocks.forEach(stock => {
          pArray.push(
            stockDB.find({ stock: stock.toUpperCase() }).count()
            .then(amount => {
              likes[stock] = amount;
            })
          );
        });

        return Promise.all(pArray);
      })
      .then(() => {
        const apiurl = `https://api.iextrading.com/1.0/stock/market/batch?symbols=${
          stocks.join(",")
        }&types=quote`;

        return new Promise((resolve, reject) => {
          https.get(apiurl, response => {
            let body = "";
            response.on("data", chunk => body += chunk);
            response.on("end", () => {
              stockData = JSON.parse(body);
              resolve();
            });
            response.on("error", () => {
              reject("Error calling API");
            });
          });
        });
      })
      .then(() => {
        const stockDataArray = [];
        let returnData;

        stocks.forEach(stock => {
          stockDataArray.push({
            stock: stock.toUpperCase(),
            price: stockData[stock.toUpperCase()].quote.latestPrice.toString(),
            likes: likes[stock]
          });
        });

        if (stockDataArray.length === 1) {
          returnData = {
            stock: stockDataArray[0].stock,
            price: stockDataArray[0].price,
            likes: stockDataArray[0].likes
          }
        } else {
          returnData = [
            {
              stock: stockDataArray[0].stock,
              price: stockDataArray[0].price,
              rel_likes: stockDataArray[0].likes - stockDataArray[1].likes
            },
            {
              stock: stockDataArray[1].stock,
              price: stockDataArray[1].price,
              rel_likes: stockDataArray[1].likes - stockDataArray[0].likes
            }
          ];
        }

        res.json({
          stockData: returnData
        });
      })
      .catch(err => {
        res.status(500).send(err.message || err);
      })
      .then(() => {
        db.close();
      });
    });
};
