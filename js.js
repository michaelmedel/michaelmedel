
// start button 
$("#start").click(function() {
    $("nav").css("visibility", "visible");
});

// close nav
$('#close').click(function(){
    $("nav").css("visibility", "hidden");
});

// about button 
$("#aboutButton").click(function() {
    $("#about").css("visibility", "visible");
});

// close about
$('#aboutClose').click(function(){
    $("#about").css("visibility", "hidden");
});

// projects button
$("#projectsButton").click(function() {
    $("#projects").css("visibility", "visible");
});

// close projects
$('#projectsClose').click(function(){
    $("#projects").css("visibility", "hidden");
});

// contact button
$("#contactButton").click(function() {
    $("#contact").css("visibility", "visible");
});

// close contact
$('#contactClose').click(function(){
    $("#contact").css("visibility", "hidden");
});

$(function(){
    $.minimalTips();
});
    



