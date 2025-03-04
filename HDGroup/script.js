let sampleText = `꿈과 희망 세상을 움직이는 현대 그룹`
let currentTab = 0
let initialDisplaySize = parseInt($(".displayText").css('font-size').slice(0, -2)) //calc(0.8vh + 10px) * 4
let initialBodySize = parseInt($(".bodyText").css('font-size').slice(0, -2))//$(".bodyText").css('font-size') //calc(0.8vh + 10px) * 1.5

const controls = $(".controls")
const tabs = $("#tabs")
const tab = $(".tab")

const titleToolBox = $('.toolBox').eq(1)
const bodyToolBox = $('.toolBox').eq(2)


const previewWrapper = $('#previews')
const preview = $('.preview')
const displayArea = $(".displayText")
const bodyArea = $(".bodyText")


const displayRange = $("#displaySizeRange")
const displayText = $("#displaySizeText")
const displayLineHeightRange = $("#displayLineHeightRange")
const displayLineHeightText = $("#displayLineHeightText")
const displayLetterSpacingRange = $("#displayLetterSpacingRange")
const displayLetterSpacingText = $("#displayLetterSpacingText")
const bodyRange = $("#bodySizeRange")
const bodyText = $("#bodySizeText")
const bodyLineHeightRange = $("#bodyLineHeightRange")
const bodyLineHeightText = $("#bodyLineHeightText")
const bodyLetterSpacingRange = $("#bodyLetterSpacingRange")
const bodyLetterSpacingText = $("#bodyLetterSpacingText")

const displayWeightSelect = titleToolBox.find("select")
const displayLighterBtn = titleToolBox.find(".lighter")
const displayHeavierBtn = titleToolBox.find(".heavier")

const bodyWeightSelect = bodyToolBox.find("select")
const bodyLighterBtn = bodyToolBox.find(".lighter")
const bodyHeavierBtn = bodyToolBox.find(".heavier")


$(document).ready(function () { 
    SetFrameRatio();
    init()
    // console.log(previewWrapper)
})

function init(){

    const lighterBtns = $(".lighter")
    const heavierBtns = $(".heavier")
    $.each(lighterBtns, function(index, lighterBtn){
        lighterBtn.disabled = true
    })
    $.each(heavierBtns, function(index, heavierBtn){
        heavierBtn.disabled = false
    })
    
    buildTab0Templates()
    setTab0Weights()

    buildTab1Selects()
    attachTab1EventListners()
    setTab1Values()

    buildTab2Templates()

    setTabs()
    setPreviewText()

}
function buildTab2Templates(){
    $("#preview2").find(".sampleText").text(sampleText)

    comp1Weight = [14, 17, 4, 8, 14]
    comp2Weight = [14, 18, 3, 6, 10]
    console.log($("#preview2Comp1").find(".sampleText"))
    $("#preview2Comp1").find(".sampleText").each(function(index, item){
        console.log(item)
        $(item).css("font-weight",Math.round(100+900/18*comp1Weight[index]))
    })
    $("#preview2Comp2").find(".sampleText").each(function(index, item){
        $(item).css("font-weight",Math.round(100+900/18*comp2Weight[index]))
    })
}
function buildTab0Templates(){
    const titleItem = (idx) => `
            <span>
                <h3>제목용 굵기 ${String(idx).padStart(2, '0')}</h3>
                <span>${sampleText}</span>
            </span>
    `
    for (let i = 1; i < 20; i++) {
        $('#preview0Title').append(titleItem(i))
    }
    const bodyItem = (idx) => `
            <span>
                <h3>본문용 굵기 ${String(idx).padStart(2, '0')}</h3>
                <span>${sampleText}</span>
            </span>
    `
    for (let i = 1; i < 20; i++) {
        $('#preview0Body').append(bodyItem(i))
    }
}
function setTab0Weights(){
    const titleItems = $('#preview0Title').children()
    const bodyItems = $('#preview0Body').children()
    for (let i = 0; i < 19; i++) {
        titleItems.eq(i).css('font-weight', 100 + 900/18*i)
        bodyItems.eq(i).css('font-weight', 100 + 900/18*i)
    }
}
function buildTab1Selects(){
    const item = ({idx, family, label}) => `
        <div class="toolBox tab2">
            <label class="toolBoxName">${label} ${idx}</label>
            <div class="weightSelectBlock flex">
                <select class= weightSelect name="${family}WeightSelect${idx}" id="${family}WeightSelect${idx}">
                </select>
                <button class="lighter"></button>
                <button class="heavier"></button>
            </div>
            <div class="input-range">
                <div class="rangeHeader flex">
                    <label>크기</label>
                    <input class="sliderLabel" type="text" inputmode="decimal" number="true" autocomplete="off" min="10" max="100" step="1" id="${family}SizeText${idx}">
                </div>
                <input class="sliderRange" type="range" min="10" max="100" step="1" id="${family}SizeRange${idx}">
            </div>
        </div>
    `
    $('#controls1').append([
        {idx:1, family: "title",label: "제목용"},
        {idx:2, family: "title",label: "제목용"},
        {idx:1, family: "body",label: "본문용"},
        {idx:2, family: "body",label: "본문용"},
        {idx:3, family: "body",label: "본문용"}
    ].map(item).join(''));


    const weightSelects = $(".weightSelect")
    const previews = $(".textArea")
    const tab2Recommendations = [5, 5, 0, 0, 0]

    weightSelects.each(function(index){
        if (index < 2){
            for (let i = 0; i < 19; i++) {
                weightSelects.eq(index).append(`<option value="${Math.round(100+900/18*i)}">제목용 굵기 ${String(i+1).padStart(2,'0')}</option>`)
            }
        }else{
            for (let i = 0; i < 19; i++) {
                weightSelects.eq(index).append(`<option value="${Math.round(100+900/18*i)}">본문용 굵기 ${String(i+1).padStart(2,'0')}</option>`)
            }
        }
        weight = Math.round(100+900/18*tab2Recommendations[index])
        weightSelects.eq(index).val(weight)
        previews.eq(index).css('font-weight', weight)
        if (weight == 100){
            weightSelects.eq(index).siblings(".lighter").prop("disabled", true)
            weightSelects.eq(index).siblings(".heavier").prop("disabled", false)
        }else if(weight == 1000){
            weightSelects.eq(index).siblings(".lighter").prop("disabled", false)
            weightSelects.eq(index).siblings(".heavier").prop("disabled", true)
        }else{
            weightSelects.eq(index).siblings(".lighter").prop("disabled", false)
            weightSelects.eq(index).siblings(".heavier").prop("disabled", false)
        }
    })
}
function attachTab1EventListners(){
    const weightSelects = $(".weightSelect")
    weightSelects.each(function(index, weightSelect){
        weightSelects.eq(index).on("change", function(){
            currentWeight = $(this).val()
            changeWeight(currentWeight, $("pre").eq(index))
            if(parseInt(currentWeight) == 100){
                $(this).siblings(".lighter").prop("disabled", true)
                $(this).siblings(".heavier").prop("disabled", false)
            }
            else if(parseInt(currentWeight) == 1000){
                $(this).siblings(".lighter").prop("disabled", false)
                $(this).siblings(".heavier").prop("disabled", true)
            }
            else{
                $(this).siblings(".lighter").prop("disabled", false)
                $(this).siblings(".heavier").prop("disabled", false)
            }
        })
    })
    const lighterBtns = $(".lighter")
    const heavierBtns = $(".heavier")
    lighterBtns.each(function(index, lighterBtn){
        lighterBtns.eq(index).on("click", function(){
            heavierBtns.eq(index).prop("disabled", false)
            if(parseInt(weightSelects.eq(index).val()) == 150){
                newVal = parseInt(weightSelects.eq(index).val()) - 50
                weightSelects.eq(index).val(newVal)
                changeWeight(newVal, $("pre").eq(index))
                this.disabled = true
                return
            }
            newVal = parseInt(weightSelects.eq(index).val()) - 50
            weightSelects.eq(index).val(newVal)
            changeWeight(newVal, $("pre").eq(index))
        })
    })
    heavierBtns.each(function(index, heavierBtn){
        heavierBtns.eq(index).on("click", function(){
            lighterBtns.eq(index).prop("disabled", false)
            if(parseInt(weightSelects.eq(index).val()) == 950){
                newVal = parseInt(weightSelects.eq(index).val()) + 50
                weightSelects.eq(index).val(newVal)
                changeWeight(newVal, $("pre").eq(index))
                this.disabled = true
                return
            } 
            newVal = parseInt(weightSelects.eq(index).val()) + 50
            weightSelects.eq(index).val(newVal)
            changeWeight(newVal, $("pre").eq(index))
        })
    })
    const ranges = $(".sliderRange")
    const texts = $(".sliderLabel")
    ranges.each(function(index, range){
        ranges.eq(index).on("input", function(){
            $("pre").eq(index).css("font-size", `${$(this).val()}px`)
            texts.eq(index).val($(this).val())
        })
    })
    texts.each(function(index, text){
        texts.eq(index).on("change", function(){
            $("pre").eq(index).css("font-size", `${$(this).val()}px`)
            ranges.eq(index).val($(this).val())
        })
    })
}
function setTab1Values(){
    const ranges = $(".sliderRange")
    const texts = $(".sliderLabel")
    ranges.each(function(index, range){
        if(index < 2){
            ranges.eq(index).val(initialDisplaySize)
            texts.eq(index).val(initialDisplaySize)
        }else{
            ranges.eq(index).val(initialBodySize)
            texts.eq(index).val(initialBodySize)
        }
    })
}
function setTabs(){
    preview.eq(currentTab).show()
    preview.eq(currentTab).siblings().hide()

    controls.css("display", "none")
    controls.eq(currentTab).show()
    
    tab.eq(currentTab).addClass("active")
    tab.eq(currentTab).siblings().removeClass("active")

    tabs.on("click", "li", function(){
        let index = $(this).index()
        currentTab = index

        preview.eq(index).show()
        preview.eq(index).siblings().hide()

        controls.css("display", "none")
        controls.eq(index).show()
        tab.eq(index).addClass("active")
        tab.eq(index).siblings().removeClass("active")  
    })

}
function changeWeight(val, target){
    target.css('font-weight', val)
}
function computeFeatureText(feature, value){
    if(feature==='ss01'){
        OTList[feature] = value
        console.log(OTList)
    }else if(feature==='ss02'){
        OTList['ss03'] = 0
        OTList['ss02'] = 1
        console.log(OTList)
    }else if(feature==='ss03' && value){
        OTList['ss02'] = 0
        OTList['ss03'] = 1
        console.log(OTList)
    }else{
        OTList['ss02'] = 0
        OTList['ss03'] = 0
        console.log(OTList) 
    }
    str = Object.keys(OTList).map(key => `"${key}" ${OTList[key]}`).join(",")
    console.log(str)
    return str
}
function setPreviewText(){
    preview.eq(1).children().text(sampleText)

    previewWrapper.children().css('font-weight', '100')
}
function SetFrameRatio(){
    let viewWidth = window.innerWidth;
    if(viewWidth < 430){
        let ratio = viewWidth / 430;
        console.log(ratio)
        $(".vfcontrol").css("transform", "scale(" + ratio + ")");
        $(".vfcontrol").css("transform-origin", "left");

        let revRatio = 1 / ratio * 100;
        $(".vfcontrol").css("width", revRatio + "%")
    }
}