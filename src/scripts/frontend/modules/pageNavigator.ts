console.log("pageNavigator.js loaded")

export const sorting_options = document.getElementsByClassName("sorting_options sort_option")
import { page_queries  } from "../modules/pageAnalyzer.js"
const pageNum = document.getElementById("page-number") as HTMLDivElement

export function addSortingEvents() {
    for (let i=0;i<sorting_options?.length;i++) {
        sorting_options[i].addEventListener('click', function() {
            console.log(sorting_options[i])
            let x = sorting_options[i] as HTMLAnchorElement
            changeSortingOption(x.dataset.option + "")
        })
    }
    
}

function changeSortingOption(x:string) {
    page_queries.sort = x
    if (x.includes("top")) {
        page_queries.t = x.split("_")[1]
        window.location.replace(window.location.origin + window.location.pathname + "?sort="+x.split("_")[0]+"&t="+page_queries.t+"&page="+page_queries.page)
    } else {
        window.location.replace(window.location.origin + window.location.pathname + "?sort="+x+"&t="+page_queries.t+"&page="+page_queries.page)
    }
}

export function addPageNavigation() {
    let total_pages = parseInt(localStorage.getItem("total_pages")+"")
    let current_page = parseInt(page_queries.page)
    let futurePage:number

    if (total_pages > current_page) {
        if (current_page > 1) {
            futurePage = current_page - 1
            let back_href = window.location.origin + window.location.pathname + "?sort="+page_queries.sort+"&t="+page_queries.t+"&page="+futurePage
            pageNum.innerHTML += "<a href='"+back_href+"'><img class='page_nav_arrow' src='../dist/images/page_backarrow.svg'></a>"
        } 
        futurePage = current_page + 1
        let forward_href = window.location.origin + window.location.pathname + "?sort="+page_queries.sort+"&t="+page_queries.t+"&page="+futurePage
        pageNum.innerHTML += "<span style='margin-top:-5px'>Page "+current_page+"/"+total_pages+"</span>"
        pageNum.innerHTML += "<a href='"+forward_href+"'><img class='page_nav_arrow rotate180' src='../dist/images/page_backarrow.svg'></a>"
        
    }
}